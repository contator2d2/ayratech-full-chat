// RH Extended — Exames Ocupacionais (ASO), EPIs, Advertências, Treinamentos, Indicadores
import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logError } from '../logger.js';

const router = express.Router();
router.use(authenticate);

async function getUserOrgId(userId) {
  const r = await query(
    `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.organization_id;
}

let tablesReady = false;
async function ensureTables() {
  if (tablesReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS employee_health_exams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      exam_type VARCHAR(30) NOT NULL,
      exam_date DATE NOT NULL,
      expiry_date DATE,
      result VARCHAR(30) DEFAULT 'apto',
      clinic_name VARCHAR(255),
      doctor_name VARCHAR(255),
      doctor_crm VARCHAR(30),
      file_url TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_health_exams_emp ON employee_health_exams(employee_id);
    CREATE INDEX IF NOT EXISTS idx_health_exams_org ON employee_health_exams(organization_id);
    CREATE INDEX IF NOT EXISTS idx_health_exams_exp ON employee_health_exams(expiry_date);
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS epi_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      name VARCHAR(255) NOT NULL,
      ca_number VARCHAR(50),
      ca_expiry DATE,
      category VARCHAR(100),
      description TEXT,
      photo_url TEXT,
      stock_qty INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 0,
      default_lifetime_days INTEGER DEFAULT 180,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_epi_catalog_org ON epi_catalog(organization_id);
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS epi_deliveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      epi_id UUID NOT NULL REFERENCES epi_catalog(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL DEFAULT 1,
      delivery_type VARCHAR(20) DEFAULT 'entrega',
      delivery_date DATE NOT NULL,
      expected_replacement DATE,
      returned_at DATE,
      signed_receipt_url TEXT,
      notes TEXT,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_epi_deliv_emp ON epi_deliveries(employee_id);
    CREATE INDEX IF NOT EXISTS idx_epi_deliv_org ON epi_deliveries(organization_id);
    CREATE INDEX IF NOT EXISTS idx_epi_deliv_rep ON epi_deliveries(expected_replacement);
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS employee_warnings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      warning_type VARCHAR(30) NOT NULL,
      warning_date DATE NOT NULL,
      reason TEXT NOT NULL,
      description TEXT,
      witnesses TEXT,
      file_url TEXT,
      acknowledged BOOLEAN DEFAULT false,
      acknowledged_at TIMESTAMPTZ,
      applied_by UUID,
      suspension_days INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_warnings_emp ON employee_warnings(employee_id);
    CREATE INDEX IF NOT EXISTS idx_warnings_org ON employee_warnings(organization_id);
    CREATE INDEX IF NOT EXISTS idx_warnings_date ON employee_warnings(warning_date);
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS trainings_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(50),
      category VARCHAR(100),
      description TEXT,
      workload_hours NUMERIC(6,2) DEFAULT 0,
      validity_months INTEGER DEFAULT 12,
      is_mandatory BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_trainings_cat_org ON trainings_catalog(organization_id);
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS employee_trainings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      training_id UUID NOT NULL REFERENCES trainings_catalog(id) ON DELETE CASCADE,
      completion_date DATE NOT NULL,
      expiry_date DATE,
      score NUMERIC(5,2),
      instructor VARCHAR(255),
      certificate_url TEXT,
      status VARCHAR(20) DEFAULT 'concluido',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_emp_train_emp ON employee_trainings(employee_id);
    CREATE INDEX IF NOT EXISTS idx_emp_train_org ON employee_trainings(organization_id);
    CREATE INDEX IF NOT EXISTS idx_emp_train_exp ON employee_trainings(expiry_date);
  `);

  tablesReady = true;
}

router.use(async (_req, _res, next) => { try { await ensureTables(); } catch (e) { logError('rh-ext.ensure', e); } next(); });

// ==================== HEALTH EXAMS (ASO) ====================
router.get('/health-exams', async (req, res) => {
  try {
    const orgId = req.query.org_id || await getUserOrgId(req.userId);
    const { employee_id, status } = req.query;
    const params = [orgId];
    let where = 'he.organization_id = $1';
    if (employee_id) { params.push(employee_id); where += ` AND he.employee_id = $${params.length}`; }
    let expiryFilter = '';
    if (status === 'vencido') expiryFilter = ' AND he.expiry_date < CURRENT_DATE';
    else if (status === 'vencendo') expiryFilter = ` AND he.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`;
    const r = await query(
      `SELECT he.*, e.full_name as employee_name, e.position
         FROM employee_health_exams he
         JOIN employees e ON e.id = he.employee_id
        WHERE ${where}${expiryFilter}
        ORDER BY he.expiry_date ASC NULLS LAST, he.exam_date DESC`, params);
    res.json(r.rows);
  } catch (e) { logError('rh-ext.exams.list', e); res.status(500).json({ error: 'Erro' }); }
});

router.post('/health-exams', async (req, res) => {
  try {
    const orgId = req.body.organization_id || await getUserOrgId(req.userId);
    const b = req.body || {};
    const r = await query(
      `INSERT INTO employee_health_exams (organization_id, employee_id, exam_type, exam_date, expiry_date, result, clinic_name, doctor_name, doctor_crm, file_url, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [orgId, b.employee_id, b.exam_type, b.exam_date, b.expiry_date || null, b.result || 'apto', b.clinic_name, b.doctor_name, b.doctor_crm, b.file_url, b.notes]);
    res.json(r.rows[0]);
  } catch (e) { logError('rh-ext.exams.create', e); res.status(500).json({ error: 'Erro' }); }
});

router.put('/health-exams/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const r = await query(
      `UPDATE employee_health_exams SET exam_type=$1, exam_date=$2, expiry_date=$3, result=$4, clinic_name=$5, doctor_name=$6, doctor_crm=$7, file_url=$8, notes=$9, updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [b.exam_type, b.exam_date, b.expiry_date || null, b.result, b.clinic_name, b.doctor_name, b.doctor_crm, b.file_url, b.notes, req.params.id]);
    res.json(r.rows[0]);
  } catch (e) { logError('rh-ext.exams.update', e); res.status(500).json({ error: 'Erro' }); }
});

router.delete('/health-exams/:id', async (req, res) => {
  try { await query(`DELETE FROM employee_health_exams WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { logError('rh-ext.exams.del', e); res.status(500).json({ error: 'Erro' }); }
});

// ==================== EPI CATALOG ====================
router.get('/epi-catalog', async (req, res) => {
  try {
    const orgId = req.query.org_id || await getUserOrgId(req.userId);
    const r = await query(`SELECT * FROM epi_catalog WHERE organization_id=$1 ORDER BY name`, [orgId]);
    res.json(r.rows);
  } catch (e) { logError('rh-ext.epi.list', e); res.status(500).json({ error: 'Erro' }); }
});

router.post('/epi-catalog', async (req, res) => {
  try {
    const orgId = req.body.organization_id || await getUserOrgId(req.userId);
    const b = req.body || {};
    const r = await query(
      `INSERT INTO epi_catalog (organization_id, name, ca_number, ca_expiry, category, description, photo_url, stock_qty, min_stock, default_lifetime_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [orgId, b.name, b.ca_number, b.ca_expiry || null, b.category, b.description, b.photo_url, b.stock_qty || 0, b.min_stock || 0, b.default_lifetime_days || 180]);
    res.json(r.rows[0]);
  } catch (e) { logError('rh-ext.epi.create', e); res.status(500).json({ error: 'Erro' }); }
});

router.put('/epi-catalog/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const r = await query(
      `UPDATE epi_catalog SET name=$1, ca_number=$2, ca_expiry=$3, category=$4, description=$5, photo_url=$6, stock_qty=$7, min_stock=$8, default_lifetime_days=$9, active=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [b.name, b.ca_number, b.ca_expiry || null, b.category, b.description, b.photo_url, b.stock_qty || 0, b.min_stock || 0, b.default_lifetime_days || 180, b.active !== false, req.params.id]);
    res.json(r.rows[0]);
  } catch (e) { logError('rh-ext.epi.update', e); res.status(500).json({ error: 'Erro' }); }
});

router.delete('/epi-catalog/:id', async (req, res) => {
  try { await query(`DELETE FROM epi_catalog WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { logError('rh-ext.epi.del', e); res.status(500).json({ error: 'Erro' }); }
});

// ==================== EPI DELIVERIES ====================
router.get('/epi-deliveries', async (req, res) => {
  try {
    const orgId = req.query.org_id || await getUserOrgId(req.userId);
    const { employee_id, status } = req.query;
    const params = [orgId];
    let where = 'd.organization_id = $1';
    if (employee_id) { params.push(employee_id); where += ` AND d.employee_id = $${params.length}`; }
    let extra = '';
    if (status === 'vencido') extra = ' AND d.expected_replacement < CURRENT_DATE AND d.returned_at IS NULL';
    else if (status === 'vencendo') extra = ` AND d.expected_replacement BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' AND d.returned_at IS NULL`;
    const r = await query(
      `SELECT d.*, e.full_name as employee_name, c.name as epi_name, c.ca_number
         FROM epi_deliveries d
         JOIN employees e ON e.id = d.employee_id
         JOIN epi_catalog c ON c.id = d.epi_id
        WHERE ${where}${extra}
        ORDER BY d.delivery_date DESC`, params);
    res.json(r.rows);
  } catch (e) { logError('rh-ext.epidel.list', e); res.status(500).json({ error: 'Erro' }); }
});

router.post('/epi-deliveries', async (req, res) => {
  try {
    const orgId = req.body.organization_id || await getUserOrgId(req.userId);
    const b = req.body || {};
    let expected = b.expected_replacement;
    if (!expected && b.delivery_date) {
      const cat = await query(`SELECT default_lifetime_days FROM epi_catalog WHERE id=$1`, [b.epi_id]);
      const days = cat.rows[0]?.default_lifetime_days || 180;
      const d = new Date(b.delivery_date + 'T12:00:00'); d.setDate(d.getDate() + days);
      expected = d.toISOString().slice(0, 10);
    }
    const r = await query(
      `INSERT INTO epi_deliveries (organization_id, employee_id, epi_id, quantity, delivery_type, delivery_date, expected_replacement, signed_receipt_url, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [orgId, b.employee_id, b.epi_id, b.quantity || 1, b.delivery_type || 'entrega', b.delivery_date, expected || null, b.signed_receipt_url, b.notes, req.userId]);
    // decrement stock on 'entrega'
    if ((b.delivery_type || 'entrega') === 'entrega') {
      await query(`UPDATE epi_catalog SET stock_qty = GREATEST(0, stock_qty - $1) WHERE id=$2`, [b.quantity || 1, b.epi_id]);
    }
    res.json(r.rows[0]);
  } catch (e) { logError('rh-ext.epidel.create', e); res.status(500).json({ error: 'Erro' }); }
});

router.put('/epi-deliveries/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const r = await query(
      `UPDATE epi_deliveries SET quantity=$1, delivery_type=$2, delivery_date=$3, expected_replacement=$4, returned_at=$5, signed_receipt_url=$6, notes=$7
       WHERE id=$8 RETURNING *`,
      [b.quantity || 1, b.delivery_type, b.delivery_date, b.expected_replacement || null, b.returned_at || null, b.signed_receipt_url, b.notes, req.params.id]);
    res.json(r.rows[0]);
  } catch (e) { logError('rh-ext.epidel.update', e); res.status(500).json({ error: 'Erro' }); }
});

router.delete('/epi-deliveries/:id', async (req, res) => {
  try { await query(`DELETE FROM epi_deliveries WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { logError('rh-ext.epidel.del', e); res.status(500).json({ error: 'Erro' }); }
});

// ==================== WARNINGS ====================
router.get('/warnings', async (req, res) => {
  try {
    const orgId = req.query.org_id || await getUserOrgId(req.userId);
    const { employee_id } = req.query;
    const params = [orgId];
    let where = 'w.organization_id = $1';
    if (employee_id) { params.push(employee_id); where += ` AND w.employee_id = $${params.length}`; }
    const r = await query(
      `SELECT w.*, e.full_name as employee_name, e.position
         FROM employee_warnings w JOIN employees e ON e.id = w.employee_id
        WHERE ${where} ORDER BY w.warning_date DESC`, params);
    res.json(r.rows);
  } catch (e) { logError('rh-ext.warn.list', e); res.status(500).json({ error: 'Erro' }); }
});

router.post('/warnings', async (req, res) => {
  try {
    const orgId = req.body.organization_id || await getUserOrgId(req.userId);
    const b = req.body || {};
    const r = await query(
      `INSERT INTO employee_warnings (organization_id, employee_id, warning_type, warning_date, reason, description, witnesses, file_url, suspension_days, applied_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [orgId, b.employee_id, b.warning_type, b.warning_date, b.reason, b.description, b.witnesses, b.file_url, b.suspension_days || 0, req.userId]);
    res.json(r.rows[0]);
  } catch (e) { logError('rh-ext.warn.create', e); res.status(500).json({ error: 'Erro' }); }
});

router.put('/warnings/:id/acknowledge', async (req, res) => {
  try {
    const r = await query(`UPDATE employee_warnings SET acknowledged=true, acknowledged_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    res.json(r.rows[0]);
  } catch (e) { logError('rh-ext.warn.ack', e); res.status(500).json({ error: 'Erro' }); }
});

router.delete('/warnings/:id', async (req, res) => {
  try { await query(`DELETE FROM employee_warnings WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { logError('rh-ext.warn.del', e); res.status(500).json({ error: 'Erro' }); }
});

// ==================== TRAININGS ====================
router.get('/trainings-catalog', async (req, res) => {
  try {
    const orgId = req.query.org_id || await getUserOrgId(req.userId);
    const r = await query(`SELECT * FROM trainings_catalog WHERE organization_id=$1 ORDER BY name`, [orgId]);
    res.json(r.rows);
  } catch (e) { logError('rh-ext.tcat.list', e); res.status(500).json({ error: 'Erro' }); }
});

router.post('/trainings-catalog', async (req, res) => {
  try {
    const orgId = req.body.organization_id || await getUserOrgId(req.userId);
    const b = req.body || {};
    const r = await query(
      `INSERT INTO trainings_catalog (organization_id, name, code, category, description, workload_hours, validity_months, is_mandatory)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [orgId, b.name, b.code, b.category, b.description, b.workload_hours || 0, b.validity_months || 12, !!b.is_mandatory]);
    res.json(r.rows[0]);
  } catch (e) { logError('rh-ext.tcat.create', e); res.status(500).json({ error: 'Erro' }); }
});

router.delete('/trainings-catalog/:id', async (req, res) => {
  try { await query(`DELETE FROM trainings_catalog WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { logError('rh-ext.tcat.del', e); res.status(500).json({ error: 'Erro' }); }
});

router.get('/employee-trainings', async (req, res) => {
  try {
    const orgId = req.query.org_id || await getUserOrgId(req.userId);
    const { employee_id, status } = req.query;
    const params = [orgId];
    let where = 'et.organization_id = $1';
    if (employee_id) { params.push(employee_id); where += ` AND et.employee_id = $${params.length}`; }
    let extra = '';
    if (status === 'vencido') extra = ' AND et.expiry_date < CURRENT_DATE';
    else if (status === 'vencendo') extra = ` AND et.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'`;
    const r = await query(
      `SELECT et.*, e.full_name as employee_name, tc.name as training_name, tc.code as training_code, tc.is_mandatory
         FROM employee_trainings et
         JOIN employees e ON e.id = et.employee_id
         JOIN trainings_catalog tc ON tc.id = et.training_id
        WHERE ${where}${extra} ORDER BY et.expiry_date ASC NULLS LAST`, params);
    res.json(r.rows);
  } catch (e) { logError('rh-ext.etrain.list', e); res.status(500).json({ error: 'Erro' }); }
});

router.post('/employee-trainings', async (req, res) => {
  try {
    const orgId = req.body.organization_id || await getUserOrgId(req.userId);
    const b = req.body || {};
    let expiry = b.expiry_date;
    if (!expiry && b.completion_date) {
      const tc = await query(`SELECT validity_months FROM trainings_catalog WHERE id=$1`, [b.training_id]);
      const months = tc.rows[0]?.validity_months || 12;
      const d = new Date(b.completion_date + 'T12:00:00'); d.setMonth(d.getMonth() + months);
      expiry = d.toISOString().slice(0, 10);
    }
    const r = await query(
      `INSERT INTO employee_trainings (organization_id, employee_id, training_id, completion_date, expiry_date, score, instructor, certificate_url, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [orgId, b.employee_id, b.training_id, b.completion_date, expiry || null, b.score || null, b.instructor, b.certificate_url, b.status || 'concluido', b.notes]);
    res.json(r.rows[0]);
  } catch (e) { logError('rh-ext.etrain.create', e); res.status(500).json({ error: 'Erro' }); }
});

router.delete('/employee-trainings/:id', async (req, res) => {
  try { await query(`DELETE FROM employee_trainings WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { logError('rh-ext.etrain.del', e); res.status(500).json({ error: 'Erro' }); }
});

// ==================== INDICATORS (aggregated dashboard) ====================
router.get('/indicators', async (req, res) => {
  try {
    const orgId = req.query.org_id || await getUserOrgId(req.userId);
    if (!orgId) return res.json({});

    const headcount = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status='ativo')::int AS active,
         COUNT(*) FILTER (WHERE status='afastado')::int AS on_leave,
         COUNT(*) FILTER (WHERE status='ferias')::int AS on_vacation,
         COUNT(*) FILTER (WHERE status='desligado')::int AS terminated
       FROM employees WHERE organization_id=$1`, [orgId]);

    // Turnover — last 12 months
    const turnover = await query(
      `WITH months AS (
         SELECT generate_series(
           date_trunc('month', CURRENT_DATE) - INTERVAL '11 months',
           date_trunc('month', CURRENT_DATE), INTERVAL '1 month')::date AS month_start
       )
       SELECT m.month_start,
         (SELECT COUNT(*) FROM employees e
            WHERE e.organization_id=$1
              AND e.admission_date <= (m.month_start + INTERVAL '1 month - 1 day')
              AND (e.termination_date IS NULL OR e.termination_date >= m.month_start))::int AS headcount,
         (SELECT COUNT(*) FROM employees e
            WHERE e.organization_id=$1
              AND e.termination_date BETWEEN m.month_start AND (m.month_start + INTERVAL '1 month - 1 day'))::int AS terminations,
         (SELECT COUNT(*) FROM employees e
            WHERE e.organization_id=$1
              AND e.admission_date BETWEEN m.month_start AND (m.month_start + INTERVAL '1 month - 1 day'))::int AS admissions
       FROM months m ORDER BY m.month_start`, [orgId]).catch(() => ({ rows: [] }));

    // Contratos de experiência (45/90 dias após admissão)
    const experience = await query(
      `SELECT id, full_name, position, admission_date,
              (admission_date + INTERVAL '45 days')::date AS first_end,
              (admission_date + INTERVAL '90 days')::date AS second_end,
              CASE
                WHEN (admission_date + INTERVAL '90 days')::date >= CURRENT_DATE
                     AND (admission_date + INTERVAL '90 days')::date <= CURRENT_DATE + INTERVAL '15 days'
                  THEN 'segundo_15d'
                WHEN (admission_date + INTERVAL '90 days')::date > CURRENT_DATE + INTERVAL '15 days'
                     AND (admission_date + INTERVAL '90 days')::date <= CURRENT_DATE + INTERVAL '45 days'
                  THEN 'segundo_45d'
                WHEN (admission_date + INTERVAL '45 days')::date >= CURRENT_DATE
                     AND (admission_date + INTERVAL '45 days')::date <= CURRENT_DATE + INTERVAL '15 days'
                  THEN 'primeiro_15d'
                ELSE 'outros'
              END AS bucket
         FROM employees
        WHERE organization_id=$1 AND status='ativo' AND admission_date IS NOT NULL
          AND admission_date >= CURRENT_DATE - INTERVAL '95 days'
          AND (admission_date + INTERVAL '90 days')::date >= CURRENT_DATE
        ORDER BY admission_date ASC`, [orgId]);

    // ASOs
    const exams = await query(
      `SELECT
         COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE)::int AS expired,
         COUNT(*) FILTER (WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')::int AS expiring_30
       FROM employee_health_exams WHERE organization_id=$1`, [orgId]).catch(() => ({ rows: [{ expired: 0, expiring_30: 0 }] }));

    const examsList = await query(
      `SELECT he.id, he.exam_type, he.expiry_date, e.full_name, e.position
         FROM employee_health_exams he JOIN employees e ON e.id = he.employee_id
        WHERE he.organization_id=$1 AND he.expiry_date IS NOT NULL
          AND he.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
        ORDER BY he.expiry_date ASC LIMIT 30`, [orgId]).catch(() => ({ rows: [] }));

    // EPIs
    const epis = await query(
      `SELECT
         (SELECT COUNT(*) FROM epi_deliveries WHERE organization_id=$1
            AND delivery_date >= date_trunc('month', CURRENT_DATE) AND delivery_type='entrega')::int AS delivered_month,
         (SELECT COUNT(*) FROM epi_deliveries WHERE organization_id=$1
            AND expected_replacement < CURRENT_DATE AND returned_at IS NULL)::int AS expired,
         (SELECT COUNT(*) FROM epi_deliveries WHERE organization_id=$1
            AND expected_replacement BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
            AND returned_at IS NULL)::int AS expiring_30,
         (SELECT COUNT(*) FROM epi_catalog WHERE organization_id=$1
            AND ca_expiry IS NOT NULL AND ca_expiry <= CURRENT_DATE + INTERVAL '60 days')::int AS ca_expiring,
         (SELECT COUNT(*) FROM epi_catalog WHERE organization_id=$1
            AND stock_qty <= min_stock AND active=true)::int AS low_stock`,
      [orgId]).catch(() => ({ rows: [{}] }));

    const epiList = await query(
      `SELECT d.id, d.expected_replacement, e.full_name, c.name AS epi_name, c.ca_number
         FROM epi_deliveries d
         JOIN employees e ON e.id=d.employee_id
         JOIN epi_catalog c ON c.id=d.epi_id
        WHERE d.organization_id=$1 AND d.returned_at IS NULL
          AND d.expected_replacement <= CURRENT_DATE + INTERVAL '30 days'
        ORDER BY d.expected_replacement ASC LIMIT 30`, [orgId]).catch(() => ({ rows: [] }));

    // Warnings — last 90d
    const warnings = await query(
      `SELECT warning_type, COUNT(*)::int AS count
         FROM employee_warnings
        WHERE organization_id=$1 AND warning_date >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY warning_type`, [orgId]).catch(() => ({ rows: [] }));

    const warningsRecent = await query(
      `SELECT w.id, w.warning_type, w.warning_date, w.reason, e.full_name
         FROM employee_warnings w JOIN employees e ON e.id=w.employee_id
        WHERE w.organization_id=$1
        ORDER BY w.warning_date DESC LIMIT 15`, [orgId]).catch(() => ({ rows: [] }));

    // Trainings expiring
    const trainings = await query(
      `SELECT
         COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE)::int AS expired,
         COUNT(*) FILTER (WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days')::int AS expiring_60
       FROM employee_trainings WHERE organization_id=$1`, [orgId]).catch(() => ({ rows: [{ expired: 0, expiring_60: 0 }] }));

    // Absenteeism — current month
    const absenteeism = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN status='falta' THEN 1 ELSE 0 END),0)::int AS absent_days,
         COUNT(*)::int AS total_records
       FROM time_records
       WHERE organization_id=$1
         AND record_date >= date_trunc('month', CURRENT_DATE)`, [orgId]).catch(() => ({ rows: [{ absent_days: 0, total_records: 0 }] }));

    // Payroll cost (current vs previous month)
    const payroll = await query(
      `SELECT reference_month, SUM(net_salary)::numeric(14,2) AS total
         FROM payslips WHERE organization_id=$1
          AND reference_month IN (to_char(CURRENT_DATE, 'YYYY-MM'), to_char(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM'))
        GROUP BY reference_month`, [orgId]).catch(() => ({ rows: [] }));

    // Birthdays this month
    const birthdays = await query(
      `SELECT id, full_name, position, birth_date
         FROM employees
        WHERE organization_id=$1 AND status='ativo' AND birth_date IS NOT NULL
          AND EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
        ORDER BY EXTRACT(DAY FROM birth_date)`, [orgId]);

    // Average tenure
    const tenure = await query(
      `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(termination_date, CURRENT_DATE) - admission_date)))/86400/365, 0)::numeric(5,2) AS years
         FROM employees WHERE organization_id=$1 AND admission_date IS NOT NULL`, [orgId]);

    // Documentos pendentes em admissões recentes (últimos 30 dias)
    const REQUIRED_DOCS = ['rg','cpf','ctps','comprovante_residencia','foto_3x4','aso_admissional'];
    const pendingDocs = await query(
      `SELECT e.id, e.full_name, e.admission_date,
              ARRAY(SELECT unnest($2::text[]) EXCEPT
                    SELECT doc_type FROM employee_documents WHERE employee_id=e.id) AS missing
         FROM employees e
        WHERE e.organization_id=$1
          AND e.admission_date IS NOT NULL
          AND e.admission_date >= CURRENT_DATE - INTERVAL '30 days'
          AND e.status='ativo'
        ORDER BY e.admission_date DESC`, [orgId, REQUIRED_DOCS]).catch(() => ({ rows: [] }));
    const pendingDocsList = pendingDocs.rows.filter(r => Array.isArray(r.missing) && r.missing.length);

    res.json({

      headcount: headcount.rows[0] || {},
      turnover_series: turnover.rows,
      experience_alerts: experience.rows,
      exams: { ...(exams.rows[0] || {}), upcoming: examsList.rows },
      epis: { ...(epis.rows[0] || {}), upcoming: epiList.rows },
      warnings_90d_by_type: warnings.rows,
      warnings_recent: warningsRecent.rows,
      trainings: trainings.rows[0] || {},
      absenteeism: absenteeism.rows[0] || {},
      payroll: payroll.rows,
      birthdays: birthdays.rows,
      avg_tenure_years: Number(tenure.rows[0]?.years || 0),
    });
  } catch (e) { logError('rh-ext.indicators', e); res.status(500).json({ error: 'Erro' }); }
});

export default router;
