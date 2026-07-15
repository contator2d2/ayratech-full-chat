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
  // Branding columns (added incrementally)
  for (const col of [
    ['company_logo_url', 'TEXT'],
    ['client_logo_url', 'TEXT'],
    ['header_title', 'TEXT'],
    ['footer_text', 'TEXT'],
    ['primary_color', 'VARCHAR(20)'],
    ['include_org_logo', 'BOOLEAN DEFAULT true'],
    ['include_brand_logo', 'BOOLEAN DEFAULT true'],
  ]) {
    await query(`ALTER TABLE merch_report_schedules ADD COLUMN IF NOT EXISTS ${col[0]} ${col[1]}`).catch(() => {});
  }
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
  const base = new Date(from);
  base.setSeconds(0, 0);
  if (sched.frequency === 'ondemand') return null;
  if (sched.frequency === 'weekly') {
    const target = Number(sched.day_of_week ?? 1); // 0=Sun..6=Sat
    const next = new Date(base);
    next.setHours(hour, 0, 0, 0);
    let diff = (target - next.getDay() + 7) % 7;
    if (diff === 0 && next <= base) diff = 7;
    next.setDate(next.getDate() + diff);
    return next;
  }
  if (sched.frequency === 'biweekly') {
    const next = new Date(base);
    next.setHours(hour, 0, 0, 0);
    const target = Number(sched.day_of_week ?? 1);
    let diff = (target - next.getDay() + 7) % 7;
    if (diff === 0 && next <= base) diff = 14;
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

// ==== Metrics query ====
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
    WHERE r.organization_id=$1
      AND r.visit_date BETWEEN $2::date AND $3::date
      ${brandFilter}
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

async function resolveBrand(orgId, brandId) {
  if (!brandId) return { id: null, name: 'Todas as marcas', logo_url: null };
  const r = await query('SELECT id, name, logo_url FROM brands WHERE id=$1 AND organization_id=$2', [brandId, orgId]);
  return r.rows[0] || { id: brandId, name: 'Marca', logo_url: null };
}

async function resolveOrg(orgId) {
  const r = await query('SELECT id, name FROM organizations WHERE id=$1', [orgId]);
  const org = r.rows[0] || { name: '' };
  try {
    const l = await query('SELECT logo_url, primary_color, header_text, footer_text FROM merch_org_letterhead WHERE organization_id=$1', [orgId]);
    if (l.rows[0]) org.letterhead = l.rows[0];
  } catch { /* table may not exist */ }
  return org;
}

// Hex #RRGGBB -> rgb(0-1)
function hexToRgb(hex, fallback = [0.12, 0.16, 0.24]) {
  if (!hex || typeof hex !== 'string') return rgb(...fallback);
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return rgb(...fallback);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function fetchImageBytes(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const isPng = ct.includes('png') || url.toLowerCase().endsWith('.png');
    return { buf, isPng };
  } catch { return null; }
}

async function embedLogo(pdf, url) {
  const data = await fetchImageBytes(url);
  if (!data) return null;
  try {
    return data.isPng ? await pdf.embedPng(data.buf) : await pdf.embedJpg(data.buf);
  } catch {
    // try the other format
    try { return data.isPng ? await pdf.embedJpg(data.buf) : await pdf.embedPng(data.buf); }
    catch { return null; }
  }
}

// ==== PDF ====
export async function buildReportPDF({ org, brand, period, metrics, extraNote, branding = {} }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const primary = hexToRgb(branding.primary_color || org.letterhead?.primary_color);
  const draw = (t, x, y, opts = {}) => page.drawText(String(t ?? ''), {
    x, y, size: opts.size || 11, font: opts.bold ? bold : font,
    color: opts.color || rgb(0.1, 0.1, 0.1)
  });

  // Header band
  page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color: primary });

  const orgLogoUrl = branding.include_org_logo !== false
    ? (branding.company_logo_url || org.letterhead?.logo_url || null) : null;
  const clientLogoUrl = branding.include_brand_logo !== false
    ? (branding.client_logo_url || brand.logo_url || null) : null;

  const orgLogo = await embedLogo(pdf, orgLogoUrl);
  const clientLogo = await embedLogo(pdf, clientLogoUrl);

  if (orgLogo) {
    const scale = Math.min(40 / orgLogo.height, 120 / orgLogo.width);
    const w = orgLogo.width * scale, h = orgLogo.height * scale;
    page.drawImage(orgLogo, { x: 20, y: 792, width: w, height: h });
  }
  if (clientLogo) {
    const scale = Math.min(40 / clientLogo.height, 120 / clientLogo.width);
    const w = clientLogo.width * scale, h = clientLogo.height * scale;
    page.drawImage(clientLogo, { x: 595 - 20 - w, y: 792, width: w, height: h });
  }

  const headerTitle = branding.header_title || org.name || 'Relatório';
  draw(headerTitle, orgLogo ? 150 : 40, 810, { size: 14, bold: true, color: rgb(1, 1, 1) });
  draw(`Relatório de rotas • ${brand.name}`, orgLogo ? 150 : 40, 792, { size: 10, color: rgb(0.95, 0.95, 0.95) });

  let y = 760;
  draw(`Período: ${period.start} a ${period.end}`, 40, y, { size: 10, color: rgb(0.35, 0.35, 0.35) }); y -= 24;

  // KPI cards
  const cards = [
    { label: 'Agendadas', value: metrics.scheduled },
    { label: 'Concluídas', value: metrics.completed },
    { label: 'Não realizadas', value: metrics.not_done },
    { label: '% Conclusão', value: `${metrics.completion_pct}%` },
  ];
  let cx = 40;
  const cardW = 125, cardH = 70;
  cards.forEach((c) => {
    page.drawRectangle({ x: cx, y: y - cardH, width: cardW, height: cardH, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 1 });
    draw(c.label, cx + 10, y - 20, { size: 10, color: rgb(0.4, 0.4, 0.4) });
    draw(c.value, cx + 10, y - 50, { size: 20, bold: true, color: primary });
    cx += cardW + 10;
  });
  y -= (cardH + 30);

  draw('Resumo', 40, y, { size: 12, bold: true, color: primary }); y -= 18;
  const lines = [
    `• Total de rotas agendadas no período: ${metrics.scheduled}`,
    `• Rotas concluídas: ${metrics.completed}`,
    `• Rotas não realizadas: ${metrics.not_done}`,
    `• Em andamento: ${metrics.in_progress}`,
    `• Taxa de conclusão: ${metrics.completion_pct}%`,
  ];
  for (const l of lines) { draw(l, 40, y, { size: 11 }); y -= 16; }

  if (extraNote) { y -= 10; draw(extraNote, 40, y, { size: 9, color: rgb(0.45, 0.45, 0.45) }); }

  const footerText = branding.footer_text || org.letterhead?.footer_text;
  if (footerText) {
    draw(footerText, 40, 55, { size: 9, color: rgb(0.4, 0.4, 0.4) });
  }
  draw(`Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, 40, 40, {
    size: 8, color: rgb(0.5, 0.5, 0.5)
  });
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

// ==== Execute a schedule (used by API + scheduler) ====
export async function executeSchedule(sched, { periodOverride } = {}) {
  const orgId = sched.organization_id;
  await resolveOrg(orgId); // warm
  const org = await resolveOrg(orgId);
  const brand = await resolveBrand(orgId, sched.brand_id);
  const period = periodOverride || computePeriod(sched.frequency);
  const metrics = await computeMetrics(orgId, sched.brand_id, period.start, period.end);
  const channels = sched.channels || {};
  const recipients = Array.isArray(sched.recipients) ? sched.recipients : [];
  const results = [];

  const branding = {
    company_logo_url: sched.company_logo_url,
    client_logo_url: sched.client_logo_url,
    header_title: sched.header_title,
    footer_text: sched.footer_text,
    primary_color: sched.primary_color,
    include_org_logo: sched.include_org_logo,
    include_brand_logo: sched.include_brand_logo,
  };
  // Build PDF once if needed
  let pdfBuffer = null;
  if (channels.email && sched.format === 'pdf') {
    pdfBuffer = await buildReportPDF({ org, brand, period, metrics, branding });
  }
  const textSummary = buildTextSummary({ brand, period, metrics });

  // Email
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

  // WhatsApp
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

  // Advance schedule
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
        company_logo_url, client_logo_url, header_title, footer_text, primary_color, include_org_logo, include_brand_logo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
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
        b.include_org_logo !== false, b.include_brand_logo !== false]
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
        updated_at=NOW()
       WHERE id=$21 AND organization_id=$22 RETURNING *`,
      [b.brand_id || null, b.name, JSON.stringify(b.metrics || {}), b.frequency,
        b.day_of_week ?? 1, b.day_of_month ?? 1, b.send_hour ?? 8,
        JSON.stringify(b.channels || {}), b.format || 'pdf',
        JSON.stringify(b.recipients || []), b.connection_id || null,
        b.active !== false, next,
        b.company_logo_url || null, b.client_logo_url || null,
        b.header_title || null, b.footer_text || null, b.primary_color || null,
        b.include_org_logo !== false, b.include_brand_logo !== false,
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
    const pdf = await buildReportPDF({ org, brand, period, metrics, branding, extraNote: 'PREVIEW — dados reais do período' });
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
      `SELECT * FROM merch_report_deliveries WHERE schedule_id=$1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 100`,
      [req.params.id, orgId]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export { ensureTables };
export default router;
