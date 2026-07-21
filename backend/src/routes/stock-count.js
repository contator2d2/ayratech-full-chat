import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { logError } from '../logger.js';

const router = express.Router();

// Auth middleware that accepts BOTH main-app tokens (userId) and promotor-app tokens (employeeId).
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), process.env.JWT_SECRET);
    req.userId = decoded.userId || null;
    req.employeeId = decoded.employeeId || decoded.employee_id || null;
    req.organizationIdFromToken = decoded.organizationId || decoded.organization_id || null;
    if (!req.userId && !req.employeeId) return res.status(401).json({ error: 'Token inválido' });
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

async function getOrgId(req) {
  if (req.organizationIdFromToken) return req.organizationIdFromToken;
  if (req.userId) {
    const r = await query('SELECT organization_id FROM organization_members WHERE user_id=$1 LIMIT 1', [req.userId]);
    if (r.rows[0]?.organization_id) return r.rows[0].organization_id;
  }
  if (req.employeeId) {
    const r = await query('SELECT organization_id FROM employees WHERE id=$1 LIMIT 1', [req.employeeId]);
    if (r.rows[0]?.organization_id) return r.rows[0].organization_id;
  }
  return null;
}

function getDatePart(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function parseDateAtNoon(value) {
  const part = getDatePart(value);
  const match = part.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeQty(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}


async function ensureTables() {
  await query(`CREATE TABLE IF NOT EXISTS stock_count_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    brand_id UUID NOT NULL,
    enabled BOOLEAN DEFAULT false,
    frequency VARCHAR(20) DEFAULT 'weekly',
    frequency_interval INTEGER DEFAULT 1,
    custom_days INTEGER,
    require_photo BOOLEAN DEFAULT false,
    require_justification BOOLEAN DEFAULT true,
    allow_postpone BOOLEAN DEFAULT true,
    postpone_limit_type VARCHAR(20) DEFAULT 'week',
    block_route_completion BOOLEAN DEFAULT false,
    selected_products JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, brand_id))`);
  // Backfill columns if table pre-existed
  try { await query(`ALTER TABLE stock_count_rules ADD COLUMN IF NOT EXISTS frequency_interval INTEGER DEFAULT 1`); } catch {}
  try { await query(`ALTER TABLE stock_count_rules ADD COLUMN IF NOT EXISTS custom_days INTEGER`); } catch {}
  try { await query(`ALTER TABLE stock_count_rules ADD COLUMN IF NOT EXISTS weekdays JSONB`); } catch {}
  try { await query(`ALTER TABLE stock_count_rules ADD COLUMN IF NOT EXISTS pdv_overrides JSONB`); } catch {}

  await query(`CREATE TABLE IF NOT EXISTS stock_count_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    route_id UUID,
    brand_id UUID NOT NULL,
    pdv_id UUID,
    promoter_id UUID,
    rule_id UUID,
    status VARCHAR(30) DEFAULT 'pending',
    week_start DATE,
    week_end DATE,
    is_mandatory BOOLEAN DEFAULT false,
    total_items INTEGER DEFAULT 0,
    completed_items INTEGER DEFAULT 0,
    progress_pct NUMERIC(5,2) DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_exec_route ON stock_count_executions(route_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_exec_brand_pdv ON stock_count_executions(brand_id, pdv_id, week_start)`);

  await query(`CREATE TABLE IF NOT EXISTS stock_count_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity NUMERIC(12,2),
    observation TEXT,
    collected_at TIMESTAMPTZ,
    collected_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW())`);
  try { await query(`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS initial_store NUMERIC(12,2)`); } catch {}
  try { await query(`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS initial_stock NUMERIC(12,2)`); } catch {}
  try { await query(`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS final_store NUMERIC(12,2)`); } catch {}
  try { await query(`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS final_stock NUMERIC(12,2)`); } catch {}

  await query(`CREATE TABLE IF NOT EXISTS stock_count_postponements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL,
    route_id UUID,
    reason TEXT NOT NULL,
    observation TEXT,
    next_route_id UUID,
    postponed_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW())`);

  await query(`CREATE TABLE IF NOT EXISTS stock_count_justifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID,
    route_id UUID,
    reason VARCHAR(255) NOT NULL,
    observation TEXT,
    justified_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW())`);
}

// Compute the period window (start,end inclusive) that contains `date` for a given rule frequency.
// Supported: weekly | biweekly | monthly | bimonthly | quarterly | semiannual | annual | custom (uses custom_days)
function computePeriodWindow(date, frequency = 'weekly', interval = 1, customDays = null) {
  const d = parseDateAtNoon(date);
  const fmt = formatLocalDate;

  const monthsMap = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 };

  if (frequency === 'weekly' || frequency === 'biweekly') {
    const weeks = frequency === 'biweekly' ? 2 : 1;
    // ISO Monday-based anchor
    const dow = (d.getDay() + 6) % 7;
    const monday = new Date(d); monday.setDate(d.getDate() - dow);
    // Anchor from a fixed reference (epoch Monday 1970-01-05) to keep buckets stable
    const anchor = new Date(1970, 0, 5, 12, 0, 0, 0);
    const diffWeeks = Math.floor((monday - anchor) / (7 * 86400000));
    const bucketIdx = Math.floor(diffWeeks / (weeks * (interval || 1)));
    const start = new Date(anchor.getTime() + bucketIdx * weeks * (interval || 1) * 7 * 86400000);
    const end = new Date(start); end.setDate(start.getDate() + weeks * (interval || 1) * 7 - 1);
    return { start: fmt(start), end: fmt(end) };
  }
  if (monthsMap[frequency]) {
    const step = monthsMap[frequency] * (interval || 1);
    // Buckets anchored at month 0 (Jan) of year 1970
    const monthsSinceAnchor = (d.getFullYear() - 1970) * 12 + d.getMonth();
    const bucketIdx = Math.floor(monthsSinceAnchor / step);
    const startMonthAbs = bucketIdx * step;
    const startYear = 1970 + Math.floor(startMonthAbs / 12);
    const startMonth = startMonthAbs % 12;
    const start = new Date(startYear, startMonth, 1);
    const end = new Date(startYear, startMonth + step, 0); // last day of period
    return { start: fmt(start), end: fmt(end) };
  }
  if (frequency === 'custom' && customDays && customDays > 0) {
    const anchor = new Date(1970, 0, 5, 12, 0, 0, 0);
    const diffDays = Math.floor((d - anchor) / 86400000);
    const bucketIdx = Math.floor(diffDays / customDays);
    const start = new Date(anchor.getTime() + bucketIdx * customDays * 86400000);
    const end = new Date(start.getTime() + (customDays - 1) * 86400000);
    return { start: fmt(start), end: fmt(end) };
  }
  // fallback = weekly
  const dow = (d.getDay() + 6) % 7;
  const monday = new Date(d); monday.setDate(d.getDate() - dow);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return { start: fmt(monday), end: fmt(sunday) };
}

// ===== RULES =====
router.get('/rules', authenticate, async (req, res) => {
  try {
    await ensureTables();
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(403).json({ error: 'Sem organização' });
    const { brand_id } = req.query;
    let sql = `SELECT r.*, b.name AS brand_name FROM stock_count_rules r
               LEFT JOIN merch_brands b ON b.id = r.brand_id WHERE r.organization_id=$1`;
    const params = [orgId];
    if (brand_id) { sql += ' AND r.brand_id=$2'; params.push(brand_id); }
    sql += ' ORDER BY b.name';
    res.json((await query(sql, params)).rows);
  } catch (err) { logError('stock-count.rules.list', err); res.status(500).json({ error: 'Erro' }); }
});

router.post('/rules', authenticate, async (req, res) => {
  try {
    await ensureTables();
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(403).json({ error: 'Sem organização' });
    const {
      id, brand_id, enabled, frequency, frequency_interval, custom_days, weekdays, pdv_overrides,
      require_photo, require_justification,
      allow_postpone, postpone_limit_type, block_route_completion, selected_products,
    } = req.body;
    const cols = {
      brand_id: brand_id || null,
      enabled: enabled ?? false,
      frequency: frequency ?? 'weekly',
      frequency_interval: Number.isFinite(Number(frequency_interval)) && Number(frequency_interval) > 0 ? Number(frequency_interval) : 1,
      custom_days: frequency === 'custom' && Number(custom_days) > 0 ? Number(custom_days) : null,
      weekdays: Array.isArray(weekdays) && weekdays.length ? JSON.stringify(weekdays.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6)) : null,
      pdv_overrides: pdv_overrides && typeof pdv_overrides === 'object' && Object.keys(pdv_overrides).length ? JSON.stringify(pdv_overrides) : null,
      require_photo: require_photo ?? false,
      require_justification: require_justification ?? true,
      allow_postpone: allow_postpone ?? true,
      postpone_limit_type: postpone_limit_type ?? 'week',
      block_route_completion: block_route_completion ?? false,
      selected_products: selected_products ? JSON.stringify(selected_products) : null,
    };
    let result;
    if (id) {
      const sets = Object.keys(cols).map((k, i) => `${k}=$${i + 1}`).join(',');
      result = await query(`UPDATE stock_count_rules SET ${sets}, updated_at=NOW() WHERE id=$${Object.keys(cols).length + 1} RETURNING *`,
        [...Object.values(cols), id]);
    } else {
      const keys = ['organization_id', ...Object.keys(cols)];
      const vals = [orgId, ...Object.values(cols)];
      const ph = vals.map((_, i) => `$${i + 1}`).join(',');
      result = await query(
        `INSERT INTO stock_count_rules (${keys.join(',')}) VALUES (${ph})
         ON CONFLICT (organization_id, brand_id) DO UPDATE SET
           enabled=EXCLUDED.enabled, frequency=EXCLUDED.frequency,
           frequency_interval=EXCLUDED.frequency_interval, custom_days=EXCLUDED.custom_days,
           weekdays=EXCLUDED.weekdays,
           pdv_overrides=EXCLUDED.pdv_overrides,
           require_photo=EXCLUDED.require_photo, require_justification=EXCLUDED.require_justification,
           allow_postpone=EXCLUDED.allow_postpone, postpone_limit_type=EXCLUDED.postpone_limit_type,
           block_route_completion=EXCLUDED.block_route_completion,
           selected_products=EXCLUDED.selected_products, updated_at=NOW()
         RETURNING *`, vals);
    }
    res.json(result.rows[0]);
  } catch (err) { logError('stock-count.rules.upsert', err); res.status(500).json({ error: 'Erro' }); }
});

router.delete('/rules/:id', authenticate, async (req, res) => {
  try { await query('DELETE FROM stock_count_rules WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (err) { logError('stock-count.rules.delete', err); res.status(500).json({ error: 'Erro' }); }
});

// ===== ROUTE VIEW (promotor) =====
// GET /route/:route_id -> list of stock_count executions for that route, one per active brand rule.
router.get('/route/:route_id', authenticate, async (req, res) => {
  try {
    await ensureTables();
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(403).json({ error: 'Sem organização' });
    const routeId = req.params.route_id;

    // Get route info: pdv, promoter, brands (single or multi), visit_date
    const routeRow = (await query(
      `SELECT r.id, r.pdv_id, r.promoter_id, r.brand_id, r.visit_date
       FROM merch_routes r WHERE r.id=$1 AND r.organization_id=$2`, [routeId, orgId])).rows[0];
    if (!routeRow) return res.json([]);

    // Determine brand list (single + multi-brand routes)
    const brandIds = new Set();
    if (routeRow.brand_id) brandIds.add(routeRow.brand_id);
    try {
      const rb = await query('SELECT brand_id FROM route_brands WHERE route_id=$1', [routeId]);
      for (const r of rb.rows) if (r.brand_id) brandIds.add(r.brand_id);
    } catch {}
    if (brandIds.size === 0) return res.json([]);

    // Rules enabled for those brands
    const rules = (await query(
      `SELECT * FROM stock_count_rules WHERE organization_id=$1 AND enabled=true AND brand_id = ANY($2)`,
      [orgId, Array.from(brandIds)])).rows;
    if (rules.length === 0) return res.json([]);

    const visitDate = routeRow.visit_date ? getDatePart(routeRow.visit_date) : formatLocalDate(new Date());

    // JS: Sunday=0..Saturday=6. Use same convention on the UI.
    const visitDow = parseDateAtNoon(visitDate).getDay();

    const productCols = 'p.id, p.name, p.sku, p.image_url AS photo_url, p.description';
    const savedProductCols = 'p.name, p.sku, p.image_url AS photo_url, p.description';
    const result = [];



    for (const rule of rules) {
      // Per-PDV override takes precedence over rule.weekdays
      const overrides = rule.pdv_overrides
        ? (typeof rule.pdv_overrides === 'object' ? rule.pdv_overrides : JSON.parse(rule.pdv_overrides))
        : null;
      const pdvOv = overrides && routeRow.pdv_id ? overrides[routeRow.pdv_id] : null;
      let effectiveWd = null;
      if (pdvOv && Array.isArray(pdvOv.weekdays)) {
        effectiveWd = pdvOv.weekdays;
      } else {
        effectiveWd = Array.isArray(rule.weekdays) ? rule.weekdays : (rule.weekdays ? JSON.parse(rule.weekdays) : null);
      }
      if (effectiveWd && effectiveWd.length && !effectiveWd.map(Number).includes(visitDow)) continue;
      // Per-rule period window based on rule.frequency
      const { start: weekStart, end: weekEnd } = computePeriodWindow(
        visitDate, rule.frequency, rule.frequency_interval || 1, rule.custom_days
      );

      // Look for an execution for this brand+pdv+period, prefer the one attached to this route
      let exec = (await query(
        `SELECT * FROM stock_count_executions
         WHERE organization_id=$1 AND brand_id=$2 AND pdv_id=$3 AND week_start=$4
         ORDER BY (route_id=$5) DESC, updated_at DESC LIMIT 1`,
        [orgId, rule.brand_id, routeRow.pdv_id, weekStart, routeId])).rows[0];

      if (!exec) {
        exec = (await query(
          `INSERT INTO stock_count_executions
           (organization_id, route_id, brand_id, pdv_id, promoter_id, rule_id, status, week_start, week_end)
           VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8) RETURNING *`,
          [orgId, routeId, rule.brand_id, routeRow.pdv_id, routeRow.promoter_id, rule.id, weekStart, weekEnd]
        )).rows[0];
      } else if (exec.route_id !== routeId && exec.status === 'postponed') {
        // Reactivate on the new visit within the same week
        exec = (await query(
          `UPDATE stock_count_executions SET route_id=$1, status='pending', updated_at=NOW()
           WHERE id=$2 RETURNING *`, [routeId, exec.id])).rows[0];
      }

      // Fetch items already saved
      const savedItems = (await query(
        `SELECT si.*, ${savedProductCols} FROM stock_count_items si
         LEFT JOIN merch_products p ON p.id = si.product_id
         WHERE si.execution_id=$1 ORDER BY p.name`, [exec.id])).rows;
      const byProduct = new Map(savedItems.map(i => [i.product_id, i]));

      // Product list: from rule.selected_products if set, otherwise all products of the brand
      let productIds = parseJsonArray(rule.selected_products);
      let products = [];
      if (productIds && productIds.length) {
        products = (await query(
          `SELECT ${productCols} FROM merch_products p WHERE p.id = ANY($1::uuid[]) ORDER BY p.name`, [productIds])).rows;
      } else {
        try {
          products = (await query(
            `SELECT ${productCols} FROM merch_products p WHERE p.brand_id=$1 ORDER BY p.name`, [rule.brand_id])).rows;
        } catch {
          products = savedItems.map(i => ({ id: i.product_id, name: i.name, sku: i.sku, photo_url: i.photo_url }));
        }
      }

      const items = products.map(p => {
        const existing = byProduct.get(p.id);
        return {
          product_id: p.id,
          product_name: p.name,
          sku: p.sku,
          photo_url: p.photo_url,
          description: p.description,
          initial_store: existing?.initial_store ?? null,
          initial_stock: existing?.initial_stock ?? null,
          final_store: existing?.final_store ?? null,
          final_stock: existing?.final_stock ?? null,
          quantity: existing?.quantity ?? null,
          observation: existing?.observation ?? '',
        };
      });

      // Brand name
      const brand = (await query('SELECT name FROM merch_brands WHERE id=$1', [rule.brand_id])).rows[0];

      result.push({
        ...exec,
        brand_name: brand?.name,
        rule,
        is_mandatory: exec.is_mandatory || false,
        items,
      });
    }

    res.json(result);
  } catch (err) { logError('stock-count.route.get', err); res.status(500).json({ error: err.message || 'Erro' }); }
});

// Save execution items
router.post('/execute', authenticate, async (req, res) => {
  try {
    await ensureTables();
    const orgId = await getOrgId(req);
    const { route_id, brand_id, pdv_id, promoter_id, items } = req.body;

    // Find existing exec in this route+brand+pdv, else create one for current week
    let exec = (await query(
      `SELECT * FROM stock_count_executions WHERE route_id=$1 AND brand_id=$2 AND pdv_id=$3 ORDER BY updated_at DESC LIMIT 1`,
      [route_id, brand_id, pdv_id])).rows[0];

    if (!exec) {
      const rule = (await query(
        `SELECT frequency, frequency_interval, custom_days FROM stock_count_rules WHERE organization_id=$1 AND brand_id=$2 LIMIT 1`,
        [orgId, brand_id])).rows[0];
      const { start, end } = computePeriodWindow(
        new Date(), rule?.frequency || 'weekly', rule?.frequency_interval || 1, rule?.custom_days
      );
      exec = (await query(
        `INSERT INTO stock_count_executions
         (organization_id, route_id, brand_id, pdv_id, promoter_id, status, week_start, week_end, started_at)
         VALUES ($1,$2,$3,$4,$5,'in_progress',$6,$7,NOW()) RETURNING *`,
        [orgId, route_id, brand_id, pdv_id, promoter_id, start, end])).rows[0];
    }

    let filled = 0;
    for (const it of (items || [])) {
      const initialStore = normalizeQty(it.initial_store);
      const initialStock = normalizeQty(it.initial_stock);
      const finalStore = normalizeQty(it.final_store);
      const finalStock = normalizeQty(it.final_stock);
      const hasCompleteBalance = [initialStore, initialStock, finalStore, finalStock].every((v) => v !== null);
      if (hasCompleteBalance) filled++;
      const finalQuantity = hasCompleteBalance ? finalStore + finalStock : normalizeQty(it.quantity);
      const existing = (await query(
        'SELECT id FROM stock_count_items WHERE execution_id=$1 AND product_id=$2',
        [exec.id, it.product_id])).rows[0];
      if (existing) {
        await query(
          `UPDATE stock_count_items
           SET quantity=$1, observation=$2, initial_store=$3, initial_stock=$4, final_store=$5, final_stock=$6,
               collected_at=CASE WHEN $7 THEN NOW() ELSE collected_at END, collected_by=$8, updated_at=NOW()
           WHERE id=$9`,
          [finalQuantity, it.observation ?? null, initialStore, initialStock, finalStore, finalStock, hasCompleteBalance, (req.userId || req.employeeId), existing.id]);
      } else {
        await query(
          `INSERT INTO stock_count_items
           (execution_id, product_id, quantity, observation, initial_store, initial_stock, final_store, final_stock, collected_at, collected_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $9 THEN NOW() ELSE NULL END,$10)`,
          [exec.id, it.product_id, finalQuantity, it.observation ?? null, initialStore, initialStock, finalStore, finalStock, hasCompleteBalance, (req.userId || req.employeeId)]);
      }
    }

    const total = (items || []).length;
    const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
    const status = filled === 0 ? 'pending' : (filled >= total ? 'completed' : 'in_progress');
    const completedAt = status === 'completed' ? 'NOW()' : 'NULL';
    await query(
      `UPDATE stock_count_executions SET total_items=$1, completed_items=$2, progress_pct=$3, status=$4,
       completed_at=${completedAt}, started_at=COALESCE(started_at, NOW()), updated_at=NOW() WHERE id=$5`,
      [total, filled, pct, status, exec.id]);

    res.json({ ok: true, execution_id: exec.id, status, progress_pct: pct });
  } catch (err) { logError('stock-count.execute', err); res.status(500).json({ error: err.message || 'Erro' }); }
});

// Postpone: "não fiz hoje" -> next visit in same week
router.post('/postpone', authenticate, async (req, res) => {
  try {
    await ensureTables();
    const { execution_id, reason, observation } = req.body;
    if (!execution_id || !reason) return res.status(400).json({ error: 'Motivo obrigatório' });

    const exec = (await query('SELECT * FROM stock_count_executions WHERE id=$1', [execution_id])).rows[0];
    if (!exec) return res.status(404).json({ error: 'Execução não encontrada' });

    // Find next route in same week for same pdv+brand (single or multi-brand)
    let nextRoute = null;
    try {
      const rows = (await query(
        `SELECT r.id FROM merch_routes r
         WHERE r.pdv_id=$1 AND r.visit_date > COALESCE((SELECT visit_date FROM merch_routes WHERE id=$2), CURRENT_DATE)
         AND r.visit_date <= $3
         AND (r.brand_id=$4 OR EXISTS (SELECT 1 FROM route_brands rb WHERE rb.route_id=r.id AND rb.brand_id=$4))
         ORDER BY r.visit_date ASC LIMIT 1`,
        [exec.pdv_id, exec.route_id, exec.week_end, exec.brand_id])).rows;
      nextRoute = rows[0]?.id || null;
    } catch {}

    // If no next route in the week -> check rule.block_route_completion to decide mandatory vs justification
    const rule = (await query('SELECT * FROM stock_count_rules WHERE id=$1', [exec.rule_id])).rows[0];
    let newStatus = 'postponed';
    let isMandatory = false;
    if (!nextRoute) {
      if (rule?.block_route_completion) {
        // Last route of the week: mark mandatory to force completion here (do not postpone)
        return res.status(400).json({ error: 'Última rota da semana — contagem obrigatória, não pode ser adiada.' });
      }
      // else: allow postpone as "no next route" -> stays postponed, needs justification when week closes
      newStatus = 'postponed';
    }

    await query(
      `INSERT INTO stock_count_postponements (execution_id, route_id, reason, observation, next_route_id, postponed_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [execution_id, exec.route_id, reason, observation ?? null, nextRoute, (req.userId || req.employeeId)]);

    await query(
      `UPDATE stock_count_executions SET status=$1, is_mandatory=$2, updated_at=NOW() WHERE id=$3`,
      [newStatus, isMandatory, execution_id]);

    res.json({ ok: true, next_route_id: nextRoute, status: newStatus });
  } catch (err) { logError('stock-count.postpone', err); res.status(500).json({ error: err.message || 'Erro' }); }
});

router.post('/justify', authenticate, async (req, res) => {
  try {
    await ensureTables();
    const { execution_id, reason, observation } = req.body;
    if (!reason) return res.status(400).json({ error: 'Motivo obrigatório' });
    const exec = (await query('SELECT * FROM stock_count_executions WHERE id=$1', [execution_id])).rows[0];
    if (!exec) return res.status(404).json({ error: 'Execução não encontrada' });
    await query(
      `INSERT INTO stock_count_justifications (execution_id, route_id, reason, observation, justified_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [execution_id, exec.route_id, reason, observation ?? null, (req.userId || req.employeeId)]);
    await query(`UPDATE stock_count_executions SET status='justified', updated_at=NOW() WHERE id=$1`, [execution_id]);
    res.json({ ok: true });
  } catch (err) { logError('stock-count.justify', err); res.status(500).json({ error: err.message || 'Erro' }); }
});

export default router;
