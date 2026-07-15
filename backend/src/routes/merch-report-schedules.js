import express from 'express';
import path from 'path';
import fs from 'fs';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logInfo, logError } from '../logger.js';
import * as whatsappProvider from '../lib/whatsapp-provider.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const router = express.Router();
router.use(authenticate);

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

async function getOrgId(userId) {
  const r = await query('SELECT organization_id FROM organization_members WHERE user_id=$1 LIMIT 1', [userId]);
  return r.rows[0]?.organization_id;
}

async function ensureTables() {
  await query(`CREATE TABLE IF NOT EXISTS merch_report_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    brand_id UUID,
    name VARCHAR(200) NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{"scheduled":true,"completed":true,"not_done":true}'::jsonb,
    frequency VARCHAR(20) NOT NULL DEFAULT 'weekly',
    day_of_week INT DEFAULT 1,
    day_of_month INT DEFAULT 1,
    send_hour INT DEFAULT 8,
    channels JSONB NOT NULL DEFAULT '{"email":true,"whatsapp":false}'::jsonb,
    format VARCHAR(20) NOT NULL DEFAULT 'pdf',
    recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
    connection_id UUID,
    active BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_mrs_org ON merch_report_schedules(organization_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_mrs_next ON merch_report_schedules(next_run_at) WHERE active`);
  for (const col of [
    ['company_logo_url', 'TEXT'],
    ['client_logo_url', 'TEXT'],
    ['header_title', 'TEXT'],
    ['footer_text', 'TEXT'],
    ['primary_color', 'VARCHAR(20)'],
    ['include_org_logo', 'BOOLEAN DEFAULT true'],
    ['include_brand_logo', 'BOOLEAN DEFAULT true'],
    ['report_type', "VARCHAR(20) DEFAULT 'both'"],
    ['include_cover', 'BOOLEAN DEFAULT true'],
    ['include_chart', 'BOOLEAN DEFAULT true'],
    ['email_intro', 'TEXT'],
    ['whatsapp_intro', 'TEXT'],
  ]) {
    await query(`ALTER TABLE merch_report_schedules ADD COLUMN IF NOT EXISTS ${col[0]} ${col[1]}`).catch(() => {});
  }
  // Ensure email_queue has attachments column
  await query(`ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS attachments JSONB`).catch(() => {});
  await query(`CREATE TABLE IF NOT EXISTS merch_report_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID REFERENCES merch_report_schedules(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    period_start DATE,
    period_end DATE,
    channel VARCHAR(20),
    recipient VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    payload JSONB,
    error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_mrd_schedule ON merch_report_deliveries(schedule_id)`);
}

// ==== Period + next_run computation ====
export function computePeriod(frequency, ref = new Date()) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  if (frequency === 'weekly') {
    const end = new Date(d); end.setDate(end.getDate() - 1);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    return { start: fmt(start), end: fmt(end) };
  }
  if (frequency === 'biweekly') {
    const end = new Date(d); end.setDate(end.getDate() - 1);
    const start = new Date(end); start.setDate(start.getDate() - 13);
    return { start: fmt(start), end: fmt(end) };
  }
  if (frequency === 'monthly') {
    const y = d.getFullYear(); const m = d.getMonth();
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return { start: fmt(start), end: fmt(end) };
  }
  const end = new Date(d);
  const start = new Date(d); start.setDate(start.getDate() - 6);
  return { start: fmt(start), end: fmt(end) };
}
function fmt(d) { return d.toISOString().slice(0, 10); }

export function computeNextRun(sched, from = new Date()) {
  const hour = Number(sched.send_hour ?? 8);
  const base = new Date(from); base.setSeconds(0, 0);
  if (sched.frequency === 'ondemand') return null;
  if (sched.frequency === 'weekly' || sched.frequency === 'biweekly') {
    const target = Number(sched.day_of_week ?? 1);
    const next = new Date(base); next.setHours(hour, 0, 0, 0);
    let diff = (target - next.getDay() + 7) % 7;
    if (diff === 0 && next <= base) diff = sched.frequency === 'biweekly' ? 14 : 7;
    next.setDate(next.getDate() + diff);
    return next;
  }
  if (sched.frequency === 'monthly') {
    const dom = Math.min(Math.max(Number(sched.day_of_month ?? 1), 1), 28);
    const next = new Date(base.getFullYear(), base.getMonth(), dom, hour, 0, 0, 0);
    if (next <= base) next.setMonth(next.getMonth() + 1);
    return next;
  }
  return null;
}

// ==== Metrics: summary + analytical ====
export async function computeMetrics(orgId, brandId, startISO, endISO) {
  const params = [orgId, startISO, endISO];
  let brandFilter = '';
  if (brandId) {
    params.push(brandId);
    brandFilter = ` AND (r.brand_id = $4 OR EXISTS (SELECT 1 FROM route_brands rb WHERE rb.route_id=r.id AND rb.brand_id=$4))`;
  }
  const q = `
    SELECT
      COUNT(*)::int AS scheduled,
      COUNT(*) FILTER (WHERE r.status='completed')::int AS completed,
      COUNT(*) FILTER (
        WHERE r.status IN ('cancelled','justified','no_show','skipped')
           OR (r.status NOT IN ('completed','in_progress') AND r.visit_date < CURRENT_DATE)
      )::int AS not_done,
      COUNT(*) FILTER (WHERE r.status='in_progress')::int AS in_progress
    FROM merch_routes r
    WHERE r.organization_id=$1 AND r.visit_date BETWEEN $2::date AND $3::date ${brandFilter}
  `;
  const r = await query(q, params);
  const row = r.rows[0] || {};
  const scheduled = row.scheduled || 0;
  const completed = row.completed || 0;
  const not_done = row.not_done || 0;
  const in_progress = row.in_progress || 0;
  const completion_pct = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
  return { scheduled, completed, not_done, in_progress, completion_pct };
}

// Detail rows for the analytical section — one row per route.
export async function computeAnalyticalRows(orgId, brandId, startISO, endISO) {
  const params = [orgId, startISO, endISO];
  let brandFilter = '';
  if (brandId) {
    params.push(brandId);
    brandFilter = ` AND (r.brand_id = $4 OR EXISTS (SELECT 1 FROM route_brands rb WHERE rb.route_id=r.id AND rb.brand_id=$4))`;
  }
  const baseSelect = (promoterExpr, itemsExpr) => `
    SELECT
      r.id, r.visit_date, r.status, r.progress_pct,
      COALESCE(p.name, '') AS pdv_name,
      COALESCE(p.city, '') AS pdv_city,
      COALESCE(p.state, '') AS pdv_state,
      ${promoterExpr} AS promoter_name,
      COALESCE(b.name, '') AS brand_name,
      ${itemsExpr.scheduled} AS items_scheduled,
      ${itemsExpr.executed} AS items_executed
    FROM merch_routes r
    LEFT JOIN pdvs p ON p.id = r.pdv_id
    LEFT JOIN employees e ON e.id = r.promoter_id
    LEFT JOIN brands b ON b.id = r.brand_id
    WHERE r.organization_id=$1 AND r.visit_date BETWEEN $2::date AND $3::date ${brandFilter}
    ORDER BY p.name NULLS LAST, r.visit_date
  `;
  const withExec = {
    scheduled: `(SELECT COUNT(*)::int FROM route_product_executions rpe WHERE rpe.route_id=r.id)`,
    executed: `(SELECT COUNT(*)::int FROM route_product_executions rpe WHERE rpe.route_id=r.id AND rpe.checked=true)`,
  };
  const noExec = { scheduled: '0', executed: '0' };
  const fallbacks = [
    baseSelect("COALESCE(e.full_name, '')", withExec),
    baseSelect("COALESCE(e.full_name, '')", noExec),
    `SELECT r.id, r.visit_date, r.status, COALESCE(r.progress_pct,0) AS progress_pct,
       COALESCE(p.name, '') AS pdv_name,
       COALESCE(p.city, '') AS pdv_city,
       COALESCE(p.state, '') AS pdv_state,
       '' AS promoter_name,
       COALESCE(b.name, '') AS brand_name,
       0 AS items_scheduled, 0 AS items_executed
     FROM merch_routes r
     LEFT JOIN pdvs p ON p.id = r.pdv_id
     LEFT JOIN brands b ON b.id = r.brand_id
     WHERE r.organization_id=$1 AND r.visit_date BETWEEN $2::date AND $3::date ${brandFilter}
     ORDER BY p.name NULLS LAST, r.visit_date`,
  ];
  let lastErr = null;
  for (const q of fallbacks) {
    try {
      const r = await query(q, params);
      return r.rows;
    } catch (e) { lastErr = e; }
  }
  logError('merch-report-schedules.analytical_query_failed', lastErr);
  return [];
}


async function resolveBrand(orgId, brandId) {
  if (!brandId) return { id: null, name: 'Todas as marcas', logo_url: null };
  const r = await query('SELECT id, name, logo_url FROM brands WHERE id=$1 AND organization_id=$2', [brandId, orgId]);
  return r.rows[0] || { id: brandId, name: 'Marca', logo_url: null };
}
async function resolveOrg(orgId) {
  // Try to grab as much company info as we can; tolerate missing columns
  let org = { name: '' };
  try {
    const r = await query('SELECT * FROM organizations WHERE id=$1', [orgId]);
    org = r.rows[0] || { name: '' };
  } catch { /* ignore */ }
  try {
    const l = await query('SELECT logo_url, primary_color, header_text, footer_text FROM merch_org_letterhead WHERE organization_id=$1', [orgId]);
    if (l.rows[0]) org.letterhead = l.rows[0];
  } catch { /* table may not exist */ }
  return org;
}

function hexToRgb(hex, fallback = [0.12, 0.16, 0.24]) {
  if (!hex || typeof hex !== 'string') return rgb(...fallback);
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return rgb(...fallback);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Read a logo either from local /uploads or via HTTP. Handles the common case
// where the DB stores a URL that points at this same backend and network fetch
// would otherwise loop.
async function fetchImageBytes(url) {
  if (!url) return null;
  try {
    // Try to map any URL/path to a local uploads file first
    const m = String(url).match(/\/uploads\/([^?#]+)$/);
    if (m) {
      const safe = m[1].replace(/\.\.\//g, '');
      const p = path.join(UPLOADS_DIR, safe);
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        const isPng = p.toLowerCase().endsWith('.png');
        return { buf, isPng };
      }
    }
    if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const isPng = ct.includes('png') || url.toLowerCase().endsWith('.png');
      return { buf, isPng };
    }
    return null;
  } catch { return null; }
}

async function embedLogo(pdf, url) {
  const data = await fetchImageBytes(url);
  if (!data) return null;
  try { return data.isPng ? await pdf.embedPng(data.buf) : await pdf.embedJpg(data.buf); }
  catch {
    try { return data.isPng ? await pdf.embedJpg(data.buf) : await pdf.embedPng(data.buf); }
    catch { return null; }
  }
}

// Row status color per user spec: green=done, yellow=partial, white=not done
function statusColor(row) {
  const scheduled = Number(row.items_scheduled || 0);
  const executed = Number(row.items_executed || 0);
  if (row.status === 'completed' && (scheduled === 0 || executed >= scheduled)) return rgb(0.78, 0.93, 0.78); // green
  if (executed > 0 || row.status === 'in_progress' || row.status === 'completed') return rgb(1.0, 0.94, 0.70); // yellow (partial)
  return rgb(1, 1, 1); // white
}

function statusLabel(row) {
  const c = statusColor(row);
  if (c.green > 0.9 && c.red < 0.9) return 'Executada';
  if (c.red > 0.95 && c.green > 0.9) return 'Parcial';
  return 'Não realizada';
}

// ==== PDF builder ====
export async function buildReportPDF({ org, brand, period, metrics, extraNote, branding = {}, analyticalRows = [], options = {} }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const primary = hexToRgb(branding.primary_color || org.letterhead?.primary_color);
  const A4 = [595, 842];
  const reportType = options.report_type || 'both';
  const includeCover = options.include_cover !== false;
  const includeChart = options.include_chart !== false;

  const orgLogoUrl = branding.include_org_logo !== false
    ? (branding.company_logo_url || org.letterhead?.logo_url || null) : null;
  const clientLogoUrl = branding.include_brand_logo !== false
    ? (branding.client_logo_url || brand.logo_url || null) : null;

  const orgLogo = await embedLogo(pdf, orgLogoUrl);
  const clientLogo = await embedLogo(pdf, clientLogoUrl);

  const drawHeader = (page, subtitle) => {
    page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color: primary });
    if (orgLogo) {
      const scale = Math.min(40 / orgLogo.height, 120 / orgLogo.width);
      page.drawImage(orgLogo, { x: 20, y: 792, width: orgLogo.width * scale, height: orgLogo.height * scale });
    }
    if (clientLogo) {
      const scale = Math.min(40 / clientLogo.height, 120 / clientLogo.width);
      const w = clientLogo.width * scale;
      page.drawImage(clientLogo, { x: 595 - 20 - w, y: 792, width: w, height: clientLogo.height * scale });
    }
    const title = branding.header_title || org.name || 'Relatório';
    page.drawText(title, { x: orgLogo ? 150 : 40, y: 810, size: 14, font: bold, color: rgb(1, 1, 1) });
    page.drawText(subtitle || `Relatório de rotas • ${brand.name}`, {
      x: orgLogo ? 150 : 40, y: 792, size: 10, font, color: rgb(0.95, 0.95, 0.95)
    });
  };

  const drawFooter = (page, pageNum, totalPages) => {
    const footerText = branding.footer_text || org.letterhead?.footer_text;
    if (footerText) page.drawText(footerText, { x: 40, y: 55, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(`Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, {
      x: 40, y: 40, size: 8, font, color: rgb(0.5, 0.5, 0.5)
    });
    // System signature (centered)
    const sysText = `Ayratech • Sistema de Gestão v${process.env.APP_VERSION || '1.0.0'}`;
    page.drawText(sysText, { x: 595 / 2 - (sysText.length * 2.1), y: 40, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
    if (totalPages) {
      page.drawText(`Página ${pageNum} de ${totalPages}`, { x: 500, y: 40, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
    }
  };


  // ===== Cover (white background, only a colored header band) =====
  if (includeCover) {
    const cover = pdf.addPage(A4);
    // Colored band only on the top
    drawHeader(cover, 'Relatório de Rotas');

    // Hero: brand logo big + title side by side
    let cy = 720;
    if (clientLogo) {
      const scale = Math.min(120 / clientLogo.height, 260 / clientLogo.width);
      const w = clientLogo.width * scale, h = clientLogo.height * scale;
      cover.drawImage(clientLogo, { x: 40, y: cy - h, width: w, height: h });
      cy -= (h + 20);
    }
    cover.drawText('Relatório de Rotas', { x: 40, y: cy, size: 26, font: bold, color: primary });
    cy -= 26;
    cover.drawText(`Marca: ${brand.name}`, { x: 40, y: cy, size: 14, font, color: rgb(0.2, 0.2, 0.2) }); cy -= 20;
    cover.drawText(`Período: ${period.start} a ${period.end}`, { x: 40, y: cy, size: 14, font, color: rgb(0.2, 0.2, 0.2) }); cy -= 30;

    // Company info block
    cover.drawText('Empresa', { x: 40, y: cy, size: 11, font: bold, color: primary }); cy -= 16;
    const lines = [
      org.name && `Razão social: ${org.name}`,
      org.email && `E-mail: ${org.email}`,
      org.phone && `Telefone: ${org.phone}`,
      (org.cnpj || org.document) && `CNPJ: ${org.cnpj || org.document}`,
      (org.address || org.city) && `Endereço: ${[org.address, org.city, org.state].filter(Boolean).join(' — ')}`,
    ].filter(Boolean);
    if (lines.length === 0) lines.push(`Razão social: ${org.name || '—'}`);
    for (const l of lines) {
      cover.drawText(String(l), { x: 40, y: cy, size: 10, font, color: rgb(0.25, 0.25, 0.25) });
      cy -= 14;
    }
    cy -= 10;
    cover.drawText('Cliente / Marca', { x: 40, y: cy, size: 11, font: bold, color: primary }); cy -= 16;
    cover.drawText(brand.name, { x: 40, y: cy, size: 12, font, color: rgb(0.2, 0.2, 0.2) }); cy -= 30;
  }



  // ===== Summary =====
  if (reportType === 'summary' || reportType === 'both') {
    const page = pdf.addPage(A4);
    drawHeader(page);
    let y = 750;
    page.drawText(`Período: ${period.start} a ${period.end}`, { x: 40, y, size: 10, font, color: rgb(0.35, 0.35, 0.35) }); y -= 26;

    const cards = [
      { label: 'Agendadas', value: metrics.scheduled },
      { label: 'Concluídas', value: metrics.completed },
      { label: 'Não realizadas', value: metrics.not_done },
      { label: '% Conclusão', value: `${metrics.completion_pct}%` },
    ];
    let cx = 40;
    const cardW = 125, cardH = 70;
    for (const c of cards) {
      page.drawRectangle({ x: cx, y: y - cardH, width: cardW, height: cardH, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 1 });
      page.drawText(String(c.label), { x: cx + 10, y: y - 20, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
      page.drawText(String(c.value), { x: cx + 10, y: y - 50, size: 20, font: bold, color: primary });
      cx += cardW + 10;
    }
    y -= (cardH + 30);

    // Bar chart
    if (includeChart) {
      page.drawText('Distribuição', { x: 40, y, size: 12, font: bold, color: primary }); y -= 20;
      const chartBase = y;
      const chartH = 140;
      const chartW = 515;
      page.drawRectangle({ x: 40, y: chartBase - chartH, width: chartW, height: chartH, borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 1 });
      const maxVal = Math.max(1, metrics.scheduled, metrics.completed, metrics.not_done, metrics.in_progress);
      const items = [
        { label: 'Agendadas', v: metrics.scheduled, color: rgb(0.34, 0.54, 0.85) },
        { label: 'Concluídas', v: metrics.completed, color: rgb(0.30, 0.75, 0.42) },
        { label: 'Parciais/And.', v: metrics.in_progress, color: rgb(0.96, 0.77, 0.19) },
        { label: 'Não real.', v: metrics.not_done, color: rgb(0.86, 0.32, 0.31) },
      ];
      const barW = 80;
      const gap = (chartW - barW * items.length) / (items.length + 1);
      items.forEach((it, i) => {
        const h = (it.v / maxVal) * (chartH - 40);
        const x = 40 + gap + i * (barW + gap);
        page.drawRectangle({ x, y: chartBase - chartH + 30, width: barW, height: h, color: it.color });
        page.drawText(String(it.v), { x: x + barW / 2 - 8, y: chartBase - chartH + 32 + h + 2, size: 9, font: bold, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(it.label, { x: x + 2, y: chartBase - chartH + 12, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
      });
      y = chartBase - chartH - 20;
    }

    page.drawText('Resumo', { x: 40, y, size: 12, font: bold, color: primary }); y -= 18;
    for (const l of [
      `• Total de rotas agendadas no período: ${metrics.scheduled}`,
      `• Rotas concluídas: ${metrics.completed}`,
      `• Rotas não realizadas: ${metrics.not_done}`,
      `• Em andamento / parciais: ${metrics.in_progress}`,
      `• Taxa de conclusão: ${metrics.completion_pct}%`,
    ]) { page.drawText(l, { x: 40, y, size: 11, font }); y -= 16; }

    if (extraNote) { y -= 8; page.drawText(String(extraNote), { x: 40, y, size: 9, font, color: rgb(0.45, 0.45, 0.45) }); }
  }

  // ===== Analytical (per-PDV table, color-coded) =====
  if (reportType === 'analytical' || reportType === 'both') {
    if (!analyticalRows.length) {
      const page = pdf.addPage(A4);
      drawHeader(page, `Analítico • ${brand.name}`);
      page.drawText('Sem registros de rotas no período selecionado.', {
        x: 40, y: 720, size: 12, font, color: rgb(0.35, 0.35, 0.35),
      });
      page.drawText('Verifique se existem rotas agendadas para a marca e o intervalo escolhidos.', {
        x: 40, y: 700, size: 10, font, color: rgb(0.5, 0.5, 0.5),
      });
    } else {
    const cols = [
      { key: 'pdv_name', label: 'PDV', w: 150 },
      { key: 'pdv_city', label: 'Cidade/UF', w: 90 },
      { key: 'promoter_name', label: 'Promotor', w: 120 },
      { key: 'visit_date', label: 'Data', w: 60 },
      { key: 'items', label: 'Itens', w: 45 },
      { key: 'status', label: 'Status', w: 65 },
    ];
    const startX = 40;
    const rowH = 18;
    const headerH = 22;
    const pageTopY = 750;
    const pageBottomY = 90;
    let page = null;
    let y = 0;

    const newPage = () => {
      page = pdf.addPage(A4);
      drawHeader(page, `Analítico • ${brand.name}`);
      y = pageTopY;
      // Table header
      let x = startX;
      page.drawRectangle({ x: startX, y: y - headerH, width: cols.reduce((s, c) => s + c.w, 0), height: headerH, color: primary });
      for (const c of cols) {
        page.drawText(c.label, { x: x + 4, y: y - 15, size: 10, font: bold, color: rgb(1, 1, 1) });
        x += c.w;
      }
      y -= headerH;
    };

    newPage();

    // Group rows by PDV
    const groups = new Map();
    for (const row of analyticalRows) {
      const key = `${row.pdv_id || row.pdv_name || '—'}`;
      if (!groups.has(key)) groups.set(key, { pdv_name: row.pdv_name || '—', pdv_city: row.pdv_city || '', pdv_state: row.pdv_state || '', rows: [] });
      groups.get(key).rows.push(row);
    }
    const sortedGroups = [...groups.values()].sort((a, b) => a.pdv_name.localeCompare(b.pdv_name, 'pt-BR'));

    const totalW = cols.reduce((s, c) => s + c.w, 0);
    const groupHeaderH = 20;
    const groupGap = 10;

    for (const g of sortedGroups) {
      if (y - (groupHeaderH + rowH) < pageBottomY) newPage();
      page.drawRectangle({ x: startX, y: y - groupHeaderH, width: totalW, height: groupHeaderH, color: rgb(0.93, 0.95, 0.98) });
      page.drawRectangle({ x: startX, y: y - groupHeaderH, width: totalW, height: groupHeaderH, borderColor: rgb(0.75, 0.8, 0.88), borderWidth: 0.5 });
      const cityStr = g.pdv_city ? ` — ${g.pdv_city}${g.pdv_state ? '/' + g.pdv_state : ''}` : '';
      page.drawText(`${g.pdv_name}${cityStr}  (${g.rows.length})`, { x: startX + 6, y: y - 14, size: 10, font: bold, color: rgb(0.15, 0.2, 0.35) });
      y -= groupHeaderH;

      for (const row of g.rows) {
        if (y - rowH < pageBottomY) newPage();
        page.drawRectangle({ x: startX, y: y - rowH, width: totalW, height: rowH, color: statusColor(row) });
        page.drawRectangle({ x: startX, y: y - rowH, width: totalW, height: rowH, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 });
        let x = startX;
        const values = {
          pdv_name: (row.pdv_name || '').slice(0, 30),
          pdv_city: `${(row.pdv_city || '').slice(0, 14)}${row.pdv_state ? '/' + row.pdv_state : ''}`,
          promoter_name: (row.promoter_name || '—').slice(0, 22),
          visit_date: row.visit_date ? new Date(row.visit_date).toLocaleDateString('pt-BR') : '—',
          items: `${row.items_executed || 0}/${row.items_scheduled || 0}`,
          status: statusLabel(row),
        };
        for (const c of cols) {
          page.drawText(String(values[c.key] ?? ''), { x: x + 4, y: y - 13, size: 9, font, color: rgb(0.15, 0.15, 0.15) });
          x += c.w;
        }
        y -= rowH;
      }
      y -= groupGap;
    }

    // Legend
    if (y - 40 < pageBottomY) newPage();
    y -= 12;
    const legend = [
      { label: 'Executada', color: rgb(0.78, 0.93, 0.78) },
      { label: 'Parcial', color: rgb(1.0, 0.94, 0.70) },
      { label: 'Não realizada', color: rgb(1, 1, 1) },
    ];
    let lx = startX;
    for (const l of legend) {
      page.drawRectangle({ x: lx, y: y - 10, width: 14, height: 10, color: l.color, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
      page.drawText(l.label, { x: lx + 18, y: y - 8, size: 9, font, color: rgb(0.25, 0.25, 0.25) });
      lx += 110;
    }
    } // end else (analyticalRows.length)
  }

  // Footers on every page
  const total = pdf.getPageCount();
  pdf.getPages().forEach((p, i) => drawFooter(p, i + 1, total));

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}


function buildTextSummary({ brand, period, metrics }) {
  return `📊 Relatório — ${brand.name}\nPeríodo: ${period.start} a ${period.end}\n\n` +
    `• Agendadas: ${metrics.scheduled}\n` +
    `• Concluídas: ${metrics.completed}\n` +
    `• Não realizadas: ${metrics.not_done}\n` +
    `• Em andamento: ${metrics.in_progress}\n` +
    `• Taxa de conclusão: ${metrics.completion_pct}%`;
}

async function getDefaultConnection(orgId, connectionId) {
  if (connectionId) {
    const r = await query(`SELECT id, name, provider, api_url, api_key, instance_name, instance_id, wapi_token, status
      FROM connections WHERE id=$1 AND organization_id=$2`, [connectionId, orgId]);
    if (r.rows[0]) return r.rows[0];
  }
  const r = await query(`SELECT id, name, provider, api_url, api_key, instance_name, instance_id, wapi_token, status
    FROM connections WHERE organization_id=$1 AND status='connected'
    ORDER BY updated_at DESC LIMIT 1`, [orgId]);
  return r.rows[0] || null;
}

function brandingFrom(sched) {
  return {
    company_logo_url: sched.company_logo_url,
    client_logo_url: sched.client_logo_url,
    header_title: sched.header_title,
    footer_text: sched.footer_text,
    primary_color: sched.primary_color,
    include_org_logo: sched.include_org_logo,
    include_brand_logo: sched.include_brand_logo,
  };
}
function optionsFrom(sched) {
  return {
    report_type: sched.report_type || 'both',
    include_cover: sched.include_cover !== false,
    include_chart: sched.include_chart !== false,
  };
}

export async function executeSchedule(sched, { periodOverride } = {}) {
  const orgId = sched.organization_id;
  const org = await resolveOrg(orgId);
  const brand = await resolveBrand(orgId, sched.brand_id);
  const period = periodOverride || computePeriod(sched.frequency);
  const metrics = await computeMetrics(orgId, sched.brand_id, period.start, period.end);
  const opts = optionsFrom(sched);
  const analyticalRows = (opts.report_type === 'analytical' || opts.report_type === 'both')
    ? await computeAnalyticalRows(orgId, sched.brand_id, period.start, period.end).catch(() => [])
    : [];
  const channels = sched.channels || {};
  const recipients = Array.isArray(sched.recipients) ? sched.recipients : [];
  const results = [];
  const branding = brandingFrom(sched);

  let pdfBuffer = null;
  if (channels.email && sched.format === 'pdf') {
    pdfBuffer = await buildReportPDF({ org, brand, period, metrics, branding, analyticalRows, options: opts });
  }
  const textSummary = buildTextSummary({ brand, period, metrics });

  if (channels.email) {
    const html = `<div style="font-family:Arial,sans-serif;color:#1f2937">
      <h2 style="color:#111827">${org.name || ''} — Relatório de rotas</h2>
      <p style="color:#4b5563"><strong>Marca:</strong> ${brand.name}<br/>
      <strong>Período:</strong> ${period.start} a ${period.end}</p>
      <table cellspacing="0" cellpadding="8" style="border-collapse:collapse;margin-top:8px">
        <tr><td style="border:1px solid #e5e7eb"><b>Agendadas</b></td><td style="border:1px solid #e5e7eb">${metrics.scheduled}</td></tr>
        <tr><td style="border:1px solid #e5e7eb"><b>Concluídas</b></td><td style="border:1px solid #e5e7eb">${metrics.completed}</td></tr>
        <tr><td style="border:1px solid #e5e7eb"><b>Não realizadas</b></td><td style="border:1px solid #e5e7eb">${metrics.not_done}</td></tr>
        <tr><td style="border:1px solid #e5e7eb"><b>Em andamento</b></td><td style="border:1px solid #e5e7eb">${metrics.in_progress}</td></tr>
        <tr><td style="border:1px solid #e5e7eb"><b>% Conclusão</b></td><td style="border:1px solid #e5e7eb">${metrics.completion_pct}%</td></tr>
      </table>
    </div>`;

    for (const rcp of recipients) {
      if (!rcp?.email) continue;
      try {
        const ins = await query(
          `INSERT INTO email_queue (organization_id, sender_user_id, to_email, to_name, subject, body_html, body_text, context_type, context_id, status, scheduled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'merch_report', $8, 'pending', NOW()) RETURNING id`,
          [orgId, sched.created_by || null, rcp.email, rcp.name || null,
            `${org.name || 'Relatório'} — ${brand.name} — ${period.start} a ${period.end}`,
            html, textSummary, sched.id]
        );
        results.push({ channel: 'email', recipient: rcp.email, status: 'queued', delivery_id: ins.rows[0].id });
        await query(
          `INSERT INTO merch_report_deliveries (schedule_id, organization_id, period_start, period_end, channel, recipient, status, payload)
           VALUES ($1,$2,$3,$4,'email',$5,'queued',$6)`,
          [sched.id, orgId, period.start, period.end, rcp.email, JSON.stringify({ metrics, hasPdf: !!pdfBuffer })]
        );
      } catch (err) {
        results.push({ channel: 'email', recipient: rcp.email, status: 'failed', error: err.message });
      }
    }
  }

  if (channels.whatsapp) {
    const connection = await getDefaultConnection(orgId, sched.connection_id);
    for (const rcp of recipients) {
      const phone = (rcp?.phone || rcp?.whatsapp || '').replace(/\D/g, '');
      if (!phone) continue;
      if (!connection) {
        results.push({ channel: 'whatsapp', recipient: phone, status: 'failed', error: 'Nenhuma conexão WhatsApp disponível' });
        continue;
      }
      try {
        const res = await whatsappProvider.sendMessage(connection, phone, textSummary, 'text');
        const ok = res?.success === true;
        results.push({ channel: 'whatsapp', recipient: phone, status: ok ? 'sent' : 'failed', error: ok ? null : (res?.error || 'falha') });
        await query(
          `INSERT INTO merch_report_deliveries (schedule_id, organization_id, period_start, period_end, channel, recipient, status, payload, sent_at, error)
           VALUES ($1,$2,$3,$4,'whatsapp',$5,$6,$7,${ok ? 'NOW()' : 'NULL'},$8)`,
          [sched.id, orgId, period.start, period.end, phone, ok ? 'sent' : 'failed',
            JSON.stringify({ metrics }), ok ? null : (res?.error || 'falha')]
        );
      } catch (err) {
        results.push({ channel: 'whatsapp', recipient: phone, status: 'failed', error: err.message });
      }
    }
  }

  const next = computeNextRun(sched, new Date());
  await query(
    `UPDATE merch_report_schedules SET last_run_at=NOW(), next_run_at=$1, updated_at=NOW() WHERE id=$2`,
    [next, sched.id]
  );

  return { period, metrics, results, next_run_at: next };
}

// ==== ROUTES ====

router.get('/', async (req, res) => {
  try {
    await ensureTables();
    const orgId = await getOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'org_not_found' });
    const r = await query(
      `SELECT s.*, b.name AS brand_name
       FROM merch_report_schedules s
       LEFT JOIN brands b ON b.id = s.brand_id
       WHERE s.organization_id=$1
       ORDER BY s.created_at DESC`, [orgId]);
    res.json(r.rows);
  } catch (e) { logError('merch-report-schedules.list', e); res.status(500).json({ error: e.message }); }
});

router.post('/preview', async (req, res) => {
  try {
    await ensureTables();
    const orgId = await getOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'org_not_found' });
    const { brand_id, frequency = 'weekly', date_from, date_to } = req.body || {};
    const period = (date_from && date_to) ? { start: date_from, end: date_to } : computePeriod(frequency);
    const metrics = await computeMetrics(orgId, brand_id || null, period.start, period.end);
    res.json({ period, metrics });
  } catch (e) { logError('merch-report-schedules.preview', e); res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    await ensureTables();
    const orgId = await getOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'org_not_found' });
    const b = req.body || {};
    const sched = {
      frequency: b.frequency || 'weekly',
      day_of_week: b.day_of_week ?? 1,
      day_of_month: b.day_of_month ?? 1,
      send_hour: b.send_hour ?? 8,
    };
    const next = computeNextRun(sched);
    const r = await query(
      `INSERT INTO merch_report_schedules
       (organization_id, brand_id, name, metrics, frequency, day_of_week, day_of_month, send_hour, channels, format, recipients, connection_id, active, next_run_at, created_by,
        company_logo_url, client_logo_url, header_title, footer_text, primary_color, include_org_logo, include_brand_logo,
        report_type, include_cover, include_chart)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
      [orgId, b.brand_id || null, b.name || 'Relatório',
        JSON.stringify(b.metrics || { scheduled: true, completed: true, not_done: true }),
        sched.frequency, sched.day_of_week, sched.day_of_month, sched.send_hour,
        JSON.stringify(b.channels || { email: true, whatsapp: false }),
        b.format || 'pdf',
        JSON.stringify(b.recipients || []),
        b.connection_id || null,
        b.active !== false,
        next,
        req.userId,
        b.company_logo_url || null, b.client_logo_url || null,
        b.header_title || null, b.footer_text || null, b.primary_color || null,
        b.include_org_logo !== false, b.include_brand_logo !== false,
        b.report_type || 'both', b.include_cover !== false, b.include_chart !== false]
    );
    res.json(r.rows[0]);
  } catch (e) { logError('merch-report-schedules.create', e); res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    await ensureTables();
    const orgId = await getOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'org_not_found' });
    const cur = await query('SELECT * FROM merch_report_schedules WHERE id=$1 AND organization_id=$2', [req.params.id, orgId]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'not_found' });
    const b = { ...cur.rows[0], ...req.body };
    const next = computeNextRun(b);
    const r = await query(
      `UPDATE merch_report_schedules SET
        brand_id=$1, name=$2, metrics=$3, frequency=$4, day_of_week=$5, day_of_month=$6,
        send_hour=$7, channels=$8, format=$9, recipients=$10, connection_id=$11, active=$12,
        next_run_at=$13,
        company_logo_url=$14, client_logo_url=$15, header_title=$16, footer_text=$17,
        primary_color=$18, include_org_logo=$19, include_brand_logo=$20,
        report_type=$21, include_cover=$22, include_chart=$23,
        updated_at=NOW()
       WHERE id=$24 AND organization_id=$25 RETURNING *`,
      [b.brand_id || null, b.name, JSON.stringify(b.metrics || {}), b.frequency,
        b.day_of_week ?? 1, b.day_of_month ?? 1, b.send_hour ?? 8,
        JSON.stringify(b.channels || {}), b.format || 'pdf',
        JSON.stringify(b.recipients || []), b.connection_id || null,
        b.active !== false, next,
        b.company_logo_url || null, b.client_logo_url || null,
        b.header_title || null, b.footer_text || null, b.primary_color || null,
        b.include_org_logo !== false, b.include_brand_logo !== false,
        b.report_type || 'both', b.include_cover !== false, b.include_chart !== false,
        req.params.id, orgId]
    );
    res.json(r.rows[0]);
  } catch (e) { logError('merch-report-schedules.update', e); res.status(500).json({ error: e.message }); }
});

// Preview PDF — returns the PDF binary using the provided config (no persistence)
router.post('/preview-pdf', async (req, res) => {
  try {
    await ensureTables();
    const orgId = await getOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'org_not_found' });
    const b = req.body || {};
    const org = await resolveOrg(orgId);
    const brand = await resolveBrand(orgId, b.brand_id || null);
    const period = (b.date_from && b.date_to)
      ? { start: b.date_from, end: b.date_to }
      : computePeriod(b.frequency || 'weekly');
    const metrics = await computeMetrics(orgId, b.brand_id || null, period.start, period.end);
    const branding = {
      company_logo_url: b.company_logo_url,
      client_logo_url: b.client_logo_url,
      header_title: b.header_title,
      footer_text: b.footer_text,
      primary_color: b.primary_color,
      include_org_logo: b.include_org_logo,
      include_brand_logo: b.include_brand_logo,
    };
    const options = {
      report_type: b.report_type || 'both',
      include_cover: b.include_cover !== false,
      include_chart: b.include_chart !== false,
    };
    const analyticalRows = (options.report_type === 'analytical' || options.report_type === 'both')
      ? await computeAnalyticalRows(orgId, b.brand_id || null, period.start, period.end).catch(() => [])
      : [];
    const pdf = await buildReportPDF({
      org, brand, period, metrics, branding, analyticalRows, options,
      extraNote: 'PREVIEW — dados reais do período'
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.send(pdf);
  } catch (e) { logError('merch-report-schedules.preview_pdf', e); res.status(500).json({ error: e.message }); }
});


router.delete('/:id', async (req, res) => {
  try {
    const orgId = await getOrgId(req.userId);
    await query('DELETE FROM merch_report_schedules WHERE id=$1 AND organization_id=$2', [req.params.id, orgId]);
    res.json({ ok: true });
  } catch (e) { logError('merch-report-schedules.delete', e); res.status(500).json({ error: e.message }); }
});

router.post('/:id/send-now', async (req, res) => {
  try {
    await ensureTables();
    const orgId = await getOrgId(req.userId);
    const r = await query('SELECT * FROM merch_report_schedules WHERE id=$1 AND organization_id=$2', [req.params.id, orgId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not_found' });
    const { date_from, date_to } = req.body || {};
    const override = (date_from && date_to) ? { start: date_from, end: date_to } : null;
    const out = await executeSchedule(r.rows[0], { periodOverride: override });
    logInfo('merch-report-schedules.send_now', { scheduleId: r.rows[0].id, results: out.results.length });
    res.json(out);
  } catch (e) { logError('merch-report-schedules.send_now', e); res.status(500).json({ error: e.message }); }
});

router.get('/:id/deliveries', async (req, res) => {
  try {
    const orgId = await getOrgId(req.userId);
    const r = await query(
      `SELECT d.*,
              eq.status AS email_status,
              eq.error_message AS email_error,
              eq.sent_at AS email_sent_at,
              eq.retry_count
       FROM merch_report_deliveries d
       LEFT JOIN email_queue eq ON eq.context_type='merch_report' AND eq.context_id=d.schedule_id
         AND eq.to_email = d.recipient
         AND eq.created_at BETWEEN d.created_at - INTERVAL '5 seconds' AND d.created_at + INTERVAL '5 seconds'
       WHERE d.schedule_id=$1 AND d.organization_id=$2
       ORDER BY d.created_at DESC LIMIT 100`,
      [req.params.id, orgId]).catch(() => query(
      `SELECT * FROM merch_report_deliveries WHERE schedule_id=$1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 100`,
      [req.params.id, orgId]));
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Download the PDF for a saved schedule (does not send anything)
router.get('/:id/pdf', async (req, res) => {
  try {
    await ensureTables();
    const orgId = await getOrgId(req.userId);
    const r = await query('SELECT * FROM merch_report_schedules WHERE id=$1 AND organization_id=$2', [req.params.id, orgId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not_found' });
    const sched = r.rows[0];
    const org = await resolveOrg(orgId);
    const brand = await resolveBrand(orgId, sched.brand_id);
    const { date_from, date_to } = req.query || {};
    const period = (date_from && date_to)
      ? { start: String(date_from), end: String(date_to) }
      : computePeriod(sched.frequency);
    const metrics = await computeMetrics(orgId, sched.brand_id, period.start, period.end);
    const opts = optionsFrom(sched);
    const analyticalRows = (opts.report_type === 'analytical' || opts.report_type === 'both')
      ? await computeAnalyticalRows(orgId, sched.brand_id, period.start, period.end).catch(() => [])
      : [];
    const pdf = await buildReportPDF({
      org, brand, period, metrics, branding: brandingFrom(sched), analyticalRows, options: opts,
    });
    const safe = (sched.name || 'relatorio').replace(/[^\w-]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}_${period.start}_${period.end}.pdf"`);
    res.send(pdf);
  } catch (e) { logError('merch-report-schedules.pdf', e); res.status(500).json({ error: e.message }); }
});

export { ensureTables };
export default router;
