import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logInfo, logError } from '../logger.js';

// ============================================================
// Auto-cadastro de colaborador via link com token + chave
// ============================================================

// Campos que podem ser solicitados ao colaborador
export const ONBOARDING_FIELDS = [
  { key: 'full_name', label: 'Nome completo', type: 'text' },
  { key: 'social_name', label: 'Nome social', type: 'text' },
  { key: 'cpf', label: 'CPF', type: 'text' },
  { key: 'rg', label: 'RG', type: 'text' },
  { key: 'rg_issuer', label: 'Órgão emissor do RG', type: 'text' },
  { key: 'birth_date', label: 'Data de nascimento', type: 'date' },
  { key: 'gender', label: 'Gênero', type: 'text' },
  { key: 'marital_status', label: 'Estado civil', type: 'text' },
  { key: 'nationality', label: 'Nacionalidade', type: 'text' },
  { key: 'email', label: 'E-mail', type: 'text' },
  { key: 'phone', label: 'Telefone / WhatsApp', type: 'text' },
  { key: 'phone2', label: 'Telefone alternativo', type: 'text' },
  { key: 'zip_code', label: 'CEP', type: 'text' },
  { key: 'address', label: 'Endereço', type: 'text' },
  { key: 'address_number', label: 'Número', type: 'text' },
  { key: 'complement', label: 'Complemento', type: 'text' },
  { key: 'neighborhood', label: 'Bairro', type: 'text' },
  { key: 'city', label: 'Cidade', type: 'text' },
  { key: 'state', label: 'UF', type: 'text' },
  { key: 'bank_name', label: 'Banco', type: 'text' },
  { key: 'bank_agency', label: 'Agência', type: 'text' },
  { key: 'bank_account', label: 'Conta', type: 'text' },
  { key: 'bank_account_type', label: 'Tipo de conta / PIX', type: 'text' },
  { key: 'ctps_number', label: 'CTPS - número', type: 'text' },
  { key: 'ctps_series', label: 'CTPS - série', type: 'text' },
  { key: 'pis_pasep', label: 'PIS/PASEP', type: 'text' },
  { key: 'voter_id', label: 'Título de eleitor', type: 'text' },
  { key: 'voter_zone', label: 'Zona eleitoral', type: 'text' },
  { key: 'voter_section', label: 'Seção eleitoral', type: 'text' },
  { key: 'military_cert', label: 'Certificado de reservista', type: 'text' },
  { key: 'cnh', label: 'CNH', type: 'text' },
  { key: 'cnh_category', label: 'Categoria da CNH', type: 'text' },
  { key: 'cnh_expiry', label: 'Validade da CNH', type: 'date' },
  { key: 'cnpj', label: 'CNPJ (PJ)', type: 'text' },
  { key: 'company_name', label: 'Razão social (PJ)', type: 'text' },
];

const FIELD_KEYS = new Set(ONBOARDING_FIELDS.map((f) => f.key));

const DEFAULT_DOCS = [
  'RG / CNH',
  'CPF',
  'Comprovante de residência',
  'Carteira de Trabalho (CTPS)',
  'Foto 3x4',
];

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.bin';
      cb(null, `onb-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

let tablesReady = false;
async function ensureTables() {
  if (tablesReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS employee_onboarding_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
      candidate_name VARCHAR(255),
      token VARCHAR(64) NOT NULL UNIQUE,
      access_key VARCHAR(32) NOT NULL,
      requested_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      requested_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      submitted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      submitted_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
      review_notes TEXT,
      message TEXT,
      expires_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ,
      applied_at TIMESTAMPTZ,
      parent_link_id UUID,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_onb_links_org ON employee_onboarding_links(organization_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_onb_links_emp ON employee_onboarding_links(employee_id)`);
  tablesReady = true;
}

async function getUserOrgId(userId) {
  const r = await query(`SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`, [userId]);
  return r.rows[0]?.organization_id;
}

function genToken() {
  return crypto.randomBytes(24).toString('hex');
}
function genKey() {
  // chave curta, legível, sem caracteres ambíguos
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
}

function sanitizeFields(list) {
  const arr = Array.isArray(list) ? list : [];
  const clean = arr.map((f) => String(f)).filter((f) => FIELD_KEYS.has(f));
  return [...new Set(clean)];
}
function sanitizeDocs(list) {
  const arr = Array.isArray(list) ? list : [];
  const clean = arr.map((d) => String(d).trim().slice(0, 120)).filter(Boolean);
  return [...new Set(clean)];
}

function isExpired(link) {
  return !!link.expires_at && new Date(link.expires_at).getTime() < Date.now();
}

// ============================================================
// ROTAS AUTENTICADAS (RH) — montadas em /api/rh
// ============================================================
const router = express.Router();
router.use(authenticate);
router.use(async (_req, _res, next) => {
  try { await ensureTables(); next(); } catch (e) { next(e); }
});

// Catálogo de campos/documentos disponíveis
router.get('/onboarding/catalog', (_req, res) => {
  res.json({ fields: ONBOARDING_FIELDS, default_docs: DEFAULT_DOCS });
});

// Listar links
router.get('/onboarding/links', async (req, res) => {
  try {
    const orgId = await getUserOrgId(req.userId);
    if (!orgId) return res.json([]);
    const params = [orgId];
    let where = `l.organization_id = $1`;
    if (req.query.employee_id) {
      params.push(req.query.employee_id);
      where += ` AND l.employee_id = $${params.length}`;
    }
    if (req.query.status) {
      params.push(req.query.status);
      where += ` AND l.status = $${params.length}`;
    }
    const r = await query(
      `SELECT l.*, e.full_name AS employee_name
       FROM employee_onboarding_links l
       LEFT JOIN employees e ON e.id = l.employee_id
       WHERE ${where}
       ORDER BY l.created_at DESC
       LIMIT 300`,
      params
    );
    res.json(r.rows);
  } catch (e) {
    logError('rh.onboarding.list', e);
    res.status(500).json({ error: e?.message || 'Erro ao listar links' });
  }
});

// Criar link (novo cadastro ou complemento de um colaborador existente)
router.post('/onboarding/links', async (req, res) => {
  try {
    const orgId = req.body.organization_id || await getUserOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'Organização não encontrada' });

    const fields = sanitizeFields(req.body.requested_fields);
    const docs = sanitizeDocs(req.body.requested_docs);
    if (!fields.length && !docs.length) {
      return res.status(400).json({ error: 'Selecione ao menos um campo ou documento' });
    }

    const days = Number(req.body.expires_in_days || 7);
    const expiresAt = new Date(Date.now() + Math.max(1, Math.min(90, days)) * 86400000);

    const token = genToken();
    const key = genKey();

    const r = await query(
      `INSERT INTO employee_onboarding_links
        (organization_id, employee_id, candidate_name, token, access_key, requested_fields, requested_docs, message, expires_at, parent_link_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)
       RETURNING *`,
      [
        orgId,
        req.body.employee_id || null,
        req.body.candidate_name || null,
        token,
        key,
        JSON.stringify(fields),
        JSON.stringify(docs),
        req.body.message || null,
        expiresAt,
        req.body.parent_link_id || null,
        req.userId,
      ]
    );
    logInfo('rh.onboarding.created', { link_id: r.rows[0].id, employee_id: req.body.employee_id || null });
    res.json(r.rows[0]);
  } catch (e) {
    logError('rh.onboarding.create', e);
    res.status(500).json({ error: e?.message || 'Erro ao criar link' });
  }
});

// Revogar link
router.post('/onboarding/links/:id/revoke', async (req, res) => {
  try {
    const orgId = await getUserOrgId(req.userId);
    const r = await query(
      `UPDATE employee_onboarding_links SET status = 'revoked', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, orgId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Link não encontrado' });
    res.json(r.rows[0]);
  } catch (e) {
    logError('rh.onboarding.revoke', e);
    res.status(500).json({ error: e?.message || 'Erro ao revogar link' });
  }
});

// Aplicar dados enviados ao colaborador (cria colaborador se não existir)
router.post('/onboarding/links/:id/apply', async (req, res) => {
  try {
    const orgId = await getUserOrgId(req.userId);
    const linkRes = await query(
      `SELECT * FROM employee_onboarding_links WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId]
    );
    const link = linkRes.rows[0];
    if (!link) return res.status(404).json({ error: 'Link não encontrado' });
    if (link.status !== 'submitted') return res.status(400).json({ error: 'Este link ainda não foi preenchido' });

    const submitted = link.submitted_data || {};
    // RH pode escolher quais campos aceitar
    const acceptKeys = Array.isArray(req.body.accept_fields) && req.body.accept_fields.length
      ? sanitizeFields(req.body.accept_fields)
      : sanitizeFields(Object.keys(submitted));

    const values = {};
    for (const k of acceptKeys) {
      const v = submitted[k];
      if (v === undefined || v === null || String(v).trim() === '') continue;
      values[k] = String(v).trim();
    }

    let employeeId = link.employee_id;

    if (!employeeId) {
      const fullName = values.full_name || link.candidate_name || 'Colaborador sem nome';
      const created = await query(
        `INSERT INTO employees (organization_id, full_name, created_by) VALUES ($1, $2, $3) RETURNING id`,
        [orgId, fullName, req.userId]
      );
      employeeId = created.rows[0].id;
      await query(`UPDATE employee_onboarding_links SET employee_id = $1 WHERE id = $2`, [employeeId, link.id]);
    }

    const entries = Object.entries(values);
    if (entries.length) {
      const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
      const params = entries.map(([, v]) => v);
      params.push(employeeId);
      await query(
        `UPDATE employees SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
        params
      );
    }

    // Documentos enviados -> employee_documents
    const docs = Array.isArray(link.submitted_docs) ? link.submitted_docs : [];
    const acceptDocs = Array.isArray(req.body.accept_docs) ? req.body.accept_docs.map(String) : null;
    for (const d of docs) {
      if (!d?.file_url) continue;
      if (acceptDocs && !acceptDocs.includes(String(d.file_url))) continue;
      await query(
        `INSERT INTO employee_documents (employee_id, doc_type, title, file_url, uploaded_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [employeeId, d.doc_type || 'documento', d.title || d.doc_type || 'Documento', d.file_url, req.userId, 'Enviado pelo colaborador via link de auto-cadastro']
      );
    }

    const updated = await query(
      `UPDATE employee_onboarding_links
       SET status = 'applied', applied_at = NOW(), updated_at = NOW(), review_notes = COALESCE($2, review_notes)
       WHERE id = $1 RETURNING *`,
      [link.id, req.body.review_notes || null]
    );

    res.json({ ...updated.rows[0], employee_id: employeeId, applied_fields: Object.keys(values) });
  } catch (e) {
    logError('rh.onboarding.apply', e);
    res.status(500).json({ error: e?.message || 'Erro ao aplicar dados' });
  }
});

// Gerar novo link de complemento (o que ainda falta)
router.post('/onboarding/links/:id/followup', async (req, res) => {
  try {
    const orgId = await getUserOrgId(req.userId);
    const prevRes = await query(
      `SELECT * FROM employee_onboarding_links WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId]
    );
    const prev = prevRes.rows[0];
    if (!prev) return res.status(404).json({ error: 'Link não encontrado' });

    const fields = sanitizeFields(req.body.requested_fields);
    const docs = sanitizeDocs(req.body.requested_docs);
    if (!fields.length && !docs.length) {
      return res.status(400).json({ error: 'Selecione o que está faltando' });
    }

    const days = Number(req.body.expires_in_days || 7);
    const expiresAt = new Date(Date.now() + Math.max(1, Math.min(90, days)) * 86400000);

    const r = await query(
      `INSERT INTO employee_onboarding_links
        (organization_id, employee_id, candidate_name, token, access_key, requested_fields, requested_docs, message, expires_at, parent_link_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)
       RETURNING *`,
      [
        orgId,
        prev.employee_id,
        prev.candidate_name,
        genToken(),
        genKey(),
        JSON.stringify(fields),
        JSON.stringify(docs),
        req.body.message || 'Faltam algumas informações para concluir seu cadastro.',
        expiresAt,
        prev.id,
        req.userId,
      ]
    );
    res.json(r.rows[0]);
  } catch (e) {
    logError('rh.onboarding.followup', e);
    res.status(500).json({ error: e?.message || 'Erro ao gerar novo link' });
  }
});

// ============================================================
// ROTAS PÚBLICAS — montadas em /api/public/rh-onboarding
// ============================================================
const publicRouter = express.Router();
publicRouter.use(async (_req, _res, next) => {
  try { await ensureTables(); next(); } catch (e) { next(e); }
});

async function loadLinkByToken(token, key) {
  const r = await query(`SELECT * FROM employee_onboarding_links WHERE token = $1`, [String(token || '')]);
  const link = r.rows[0];
  if (!link) return { error: 'Link inválido', status: 404 };
  if (link.status === 'revoked') return { error: 'Este link foi cancelado pelo RH', status: 410 };
  if (isExpired(link)) return { error: 'Este link expirou. Solicite um novo ao RH', status: 410 };
  if (String(key || '').trim().toUpperCase() !== String(link.access_key).toUpperCase()) {
    return { error: 'Chave de acesso inválida', status: 401 };
  }
  return { link };
}

// Metadados do link (valida chave)
publicRouter.get('/:token', async (req, res) => {
  try {
    const { link, error, status } = await loadLinkByToken(req.params.token, req.query.key);
    if (error) return res.status(status).json({ error });

    let orgName = null;
    try {
      const o = await query(`SELECT name FROM organizations WHERE id = $1`, [link.organization_id]);
      orgName = o.rows[0]?.name || null;
    } catch (_) {}

    res.json({
      status: link.status,
      candidate_name: link.candidate_name,
      message: link.message,
      organization_name: orgName,
      expires_at: link.expires_at,
      requested_fields: (link.requested_fields || []).map((k) => ONBOARDING_FIELDS.find((f) => f.key === k)).filter(Boolean),
      requested_docs: link.requested_docs || [],
      submitted_data: link.status === 'pending' ? {} : (link.submitted_data || {}),
      submitted_docs: link.status === 'pending' ? [] : (link.submitted_docs || []),
    });
  } catch (e) {
    logError('rh.onboarding.public.get', e);
    res.status(500).json({ error: 'Erro ao carregar formulário' });
  }
});

// Upload de documento pelo colaborador
publicRouter.post('/:token/upload', upload.single('file'), async (req, res) => {
  try {
    const { link, error, status } = await loadLinkByToken(req.params.token, req.query.key || req.body?.key);
    if (error) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
      return res.status(status).json({ error });
    }
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    void link;
    res.json({ success: true, file: { url: `/uploads/${req.file.filename}`, originalName: req.file.originalname, size: req.file.size } });
  } catch (e) {
    logError('rh.onboarding.public.upload', e);
    res.status(500).json({ error: 'Erro ao enviar arquivo' });
  }
});

// Envio do formulário
publicRouter.post('/:token/submit', async (req, res) => {
  try {
    const { link, error, status } = await loadLinkByToken(req.params.token, req.body?.key || req.query.key);
    if (error) return res.status(status).json({ error });
    if (link.status === 'applied') return res.status(400).json({ error: 'Este cadastro já foi processado pelo RH' });

    const requested = sanitizeFields(link.requested_fields);
    const data = {};
    for (const k of requested) {
      const v = req.body?.data?.[k];
      if (v === undefined || v === null) continue;
      data[k] = String(v).slice(0, 500);
    }

    const docs = Array.isArray(req.body?.docs)
      ? req.body.docs
          .filter((d) => d && typeof d.file_url === 'string' && d.file_url.startsWith('/uploads/'))
          .slice(0, 40)
          .map((d) => ({
            doc_type: String(d.doc_type || 'documento').slice(0, 120),
            title: String(d.title || d.doc_type || 'Documento').slice(0, 200),
            file_url: d.file_url,
          }))
      : [];

    const r = await query(
      `UPDATE employee_onboarding_links
       SET submitted_data = $2::jsonb, submitted_docs = $3::jsonb, status = 'submitted', submitted_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING id, status, submitted_at`,
      [link.id, JSON.stringify(data), JSON.stringify(docs)]
    );
    logInfo('rh.onboarding.submitted', { link_id: link.id, fields: Object.keys(data).length, docs: docs.length });
    res.json({ success: true, ...r.rows[0] });
  } catch (e) {
    logError('rh.onboarding.public.submit', e);
    res.status(500).json({ error: 'Erro ao enviar cadastro' });
  }
});

export { publicRouter as rhOnboardingPublicRouter };
export default router;
