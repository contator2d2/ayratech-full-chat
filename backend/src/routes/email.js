import express from 'express';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logInfo, logError } from '../logger.js';

const router = express.Router();
router.use(authenticate);

// Encryption key (should be in env in production)
const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'whatsale-email-key-32chars!!';
const ALGORITHM = 'aes-256-cbc';

// Encrypt password
function encryptPassword(password) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Decrypt password
function decryptPassword(encryptedPassword) {
  const [ivHex, encrypted] = encryptedPassword.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Helper: Get user's organization
async function getUserOrg(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role 
     FROM organization_members om 
     WHERE om.user_id = $1 
     LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

// Helper: Check if user can manage settings
function canManage(role) {
  return ['owner', 'admin', 'manager'].includes(role);
}

// Helper: Get SMTP config for user (user config overrides org config)
async function getSmtpConfig(userId, organizationId) {
  // First check user-specific config
  const userConfig = await query(
    `SELECT * FROM email_user_smtp_configs 
     WHERE user_id = $1 AND organization_id = $2 AND is_active = true`,
    [userId, organizationId]
  );

  if (userConfig.rows[0]) {
    return { ...userConfig.rows[0], source: 'user' };
  }

  // Fall back to org config
  const orgConfig = await query(
    `SELECT * FROM email_smtp_configs 
     WHERE organization_id = $1 AND is_active = true`,
    [organizationId]
  );

  if (orgConfig.rows[0]) {
    return { ...orgConfig.rows[0], source: 'organization' };
  }

  return null;
}

// Helper: Create nodemailer transporter
function createTransporter(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: decryptPassword(config.password_encrypted),
    },
    tls: {
      // Allow self-signed or mismatched certificates (common in shared hosting)
      rejectUnauthorized: false,
    },
  });
}

// Helper: Replace variables in template (supports both {var} and {{var}})
function interpolateVariables(text, variables) {
  if (!text) return text;
  
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    // Replace {{var}} and {var} patterns
    const regexDouble = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    const regexSingle = new RegExp(`\\{${key}\\}`, 'gi');
    result = result.replace(regexDouble, value || '');
    result = result.replace(regexSingle, value || '');
  }
  return result;
}

// ============================================
// SMTP CONFIGURATION (Organization)
// ============================================

// Get org SMTP config
router.get('/smtp/org', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `SELECT id, host, port, secure, username, from_name, from_email, reply_to, 
              is_active, is_verified, last_verified_at, created_at
       FROM email_smtp_configs WHERE organization_id = $1`,
      [org.organization_id]
    );

    res.json(result.rows[0] || null);
  } catch (error) {
    logError('Error fetching org SMTP config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save org SMTP config
router.put('/smtp/org', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org || !canManage(org.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { host, port, secure, username, password, from_name, from_email, reply_to } = req.body;

    if (!host || !username || !password || !from_email) {
      return res.status(400).json({ error: 'Campos obrigatórios: host, username, password, from_email' });
    }

    const passwordEncrypted = encryptPassword(password);

    const result = await query(
      `INSERT INTO email_smtp_configs 
       (organization_id, host, port, secure, username, password_encrypted, from_name, from_email, reply_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (organization_id) DO UPDATE SET
         host = EXCLUDED.host,
         port = EXCLUDED.port,
         secure = EXCLUDED.secure,
         username = EXCLUDED.username,
         password_encrypted = EXCLUDED.password_encrypted,
         from_name = EXCLUDED.from_name,
         from_email = EXCLUDED.from_email,
         reply_to = EXCLUDED.reply_to,
         is_verified = false,
         updated_at = NOW()
       RETURNING id, host, port, secure, username, from_name, from_email, reply_to, is_active, is_verified`,
      [org.organization_id, host, port || 587, secure !== false, username, passwordEncrypted, 
       from_name, from_email, reply_to, req.userId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logError('Error saving org SMTP config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test org SMTP config
router.post('/smtp/org/test', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const config = await query(
      `SELECT * FROM email_smtp_configs WHERE organization_id = $1`,
      [org.organization_id]
    );

    if (!config.rows[0]) {
      return res.status(404).json({ error: 'Nenhuma configuração SMTP encontrada' });
    }

    const smtpConfig = config.rows[0];
    const transporter = createTransporter(smtpConfig);

    // Send test email
    const testEmail = req.body.test_email || smtpConfig.from_email;
    
    await transporter.sendMail({
      from: `"${smtpConfig.from_name}" <${smtpConfig.from_email}>`,
      to: testEmail,
      subject: 'Teste de configuração SMTP - Ayratech',
      html: `
        <h2>✅ Configuração SMTP funcionando!</h2>
        <p>Este é um email de teste para verificar se sua configuração SMTP está correta.</p>
        <p><strong>Servidor:</strong> ${smtpConfig.host}:${smtpConfig.port}</p>
        <p><strong>Usuário:</strong> ${smtpConfig.username}</p>
        <hr>
        <p><small>Enviado por Ayratech</small></p>
      `,
    });

    // Update verification status
    await query(
      `UPDATE email_smtp_configs SET is_verified = true, last_verified_at = NOW() WHERE id = $1`,
      [smtpConfig.id]
    );

    res.json({ success: true, message: `Email de teste enviado para ${testEmail}` });
  } catch (error) {
    logError('Error testing SMTP:', error);
    res.status(500).json({ error: `Falha no envio: ${error.message}` });
  }
});

// ============================================
// SMTP CONFIGURATION (User)
// ============================================

// Get user SMTP config
router.get('/smtp/user', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `SELECT id, host, port, secure, username, from_name, from_email, reply_to, 
              is_active, is_verified, last_verified_at, created_at
       FROM email_user_smtp_configs WHERE user_id = $1 AND organization_id = $2`,
      [req.userId, org.organization_id]
    );

    res.json(result.rows[0] || null);
  } catch (error) {
    logError('Error fetching user SMTP config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save user SMTP config
router.put('/smtp/user', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { host, port, secure, username, password, from_name, from_email, reply_to, is_active } = req.body;

    // Allow disabling without full config
    if (is_active === false) {
      await query(
        `UPDATE email_user_smtp_configs SET is_active = false WHERE user_id = $1 AND organization_id = $2`,
        [req.userId, org.organization_id]
      );
      return res.json({ success: true });
    }

    if (!host || !username || !password || !from_email) {
      return res.status(400).json({ error: 'Campos obrigatórios: host, username, password, from_email' });
    }

    const passwordEncrypted = encryptPassword(password);

    const result = await query(
      `INSERT INTO email_user_smtp_configs 
       (user_id, organization_id, host, port, secure, username, password_encrypted, from_name, from_email, reply_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, organization_id) DO UPDATE SET
         host = EXCLUDED.host,
         port = EXCLUDED.port,
         secure = EXCLUDED.secure,
         username = EXCLUDED.username,
         password_encrypted = EXCLUDED.password_encrypted,
         from_name = EXCLUDED.from_name,
         from_email = EXCLUDED.from_email,
         reply_to = EXCLUDED.reply_to,
         is_active = true,
         is_verified = false,
         updated_at = NOW()
       RETURNING id, host, port, secure, username, from_name, from_email, reply_to, is_active, is_verified`,
      [req.userId, org.organization_id, host, port || 587, secure !== false, username, 
       passwordEncrypted, from_name, from_email, reply_to]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logError('Error saving user SMTP config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test user SMTP config
router.post('/smtp/user/test', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const config = await query(
      `SELECT * FROM email_user_smtp_configs WHERE user_id = $1 AND organization_id = $2`,
      [req.userId, org.organization_id]
    );

    if (!config.rows[0]) {
      return res.status(404).json({ error: 'Nenhuma configuração SMTP pessoal encontrada' });
    }

    const smtpConfig = config.rows[0];
    const transporter = createTransporter(smtpConfig);

    const testEmail = req.body.test_email || smtpConfig.from_email;
    
    await transporter.sendMail({
      from: `"${smtpConfig.from_name}" <${smtpConfig.from_email}>`,
      to: testEmail,
      subject: 'Teste de configuração SMTP pessoal - Whatsale',
      html: `
        <h2>✅ Sua configuração SMTP pessoal está funcionando!</h2>
        <p>Este é um email de teste para verificar sua configuração.</p>
        <hr>
        <p><small>Enviado por Whatsale</small></p>
      `,
    });

    await query(
      `UPDATE email_user_smtp_configs SET is_verified = true, last_verified_at = NOW() WHERE id = $1`,
      [smtpConfig.id]
    );

    res.json({ success: true, message: `Email de teste enviado para ${testEmail}` });
  } catch (error) {
    logError('Error testing user SMTP:', error);
    res.status(500).json({ error: `Falha no envio: ${error.message}` });
  }
});

// ============================================
// EMAIL TEMPLATES
// ============================================

// List templates
router.get('/templates', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { category } = req.query;
    let sql = `SELECT t.*, u.name as created_by_name 
               FROM email_templates t
               LEFT JOIN users u ON u.id = t.created_by
               WHERE t.organization_id = $1`;
    const params = [org.organization_id];

    if (category) {
      sql += ` AND t.category = $2`;
      params.push(category);
    }

    sql += ` ORDER BY t.name`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    logError('Error fetching templates:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get template
router.get('/templates/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `SELECT * FROM email_templates WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Template not found' });
    res.json(result.rows[0]);
  } catch (error) {
    logError('Error fetching template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create template
router.post('/templates', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { name, description, category, subject, body_html, body_text, available_variables } = req.body;

    if (!name || !subject || !body_html) {
      return res.status(400).json({ error: 'Campos obrigatórios: name, subject, body_html' });
    }

    const result = await query(
      `INSERT INTO email_templates 
       (organization_id, name, description, category, subject, body_html, body_text, available_variables, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [org.organization_id, name, description, category || 'general', subject, body_html, body_text,
       available_variables || ['nome', 'email', 'telefone', 'empresa'], req.userId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logError('Error creating template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update template
router.put('/templates/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { name, description, category, subject, body_html, body_text, available_variables, is_active } = req.body;

    const result = await query(
      `UPDATE email_templates SET
         name = COALESCE($1, name),
         description = $2,
         category = COALESCE($3, category),
         subject = COALESCE($4, subject),
         body_html = COALESCE($5, body_html),
         body_text = $6,
         available_variables = COALESCE($7, available_variables),
         is_active = COALESCE($8, is_active),
         updated_at = NOW()
       WHERE id = $9 AND organization_id = $10
       RETURNING *`,
      [name, description, category, subject, body_html, body_text, available_variables, 
       is_active, req.params.id, org.organization_id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Template not found' });
    res.json(result.rows[0]);
  } catch (error) {
    logError('Error updating template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete template
router.delete('/templates/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    await query(
      `DELETE FROM email_templates WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );

    res.json({ success: true });
  } catch (error) {
    logError('Error deleting template:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SEND EMAIL
// ============================================

// Send email (adds to queue)
router.post('/send', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { 
      template_id, 
      to_email, 
      to_name,
      cc,
      bcc,
      subject, 
      body_html, 
      body_text,
      variables,
      context_type,
      context_id,
      send_immediately,
      attachments
    } = req.body;

    if (!to_email) {
      return res.status(400).json({ error: 'Email do destinatário é obrigatório' });
    }

    let finalSubject = subject;
    let finalBodyHtml = body_html;
    let finalBodyText = body_text;

    // If using template, load and interpolate
    if (template_id) {
      const templateResult = await query(
        `SELECT * FROM email_templates WHERE id = $1 AND organization_id = $2`,
        [template_id, org.organization_id]
      );

      if (!templateResult.rows[0]) {
        return res.status(404).json({ error: 'Template não encontrado' });
      }

      const template = templateResult.rows[0];
      finalSubject = finalSubject || template.subject;
      finalBodyHtml = finalBodyHtml || template.body_html;
      finalBodyText = finalBodyText || template.body_text;
    }

    if (!finalSubject || !finalBodyHtml) {
      return res.status(400).json({ error: 'Assunto e corpo do email são obrigatórios' });
    }

    // Interpolate variables
    const vars = variables || {};
    finalSubject = interpolateVariables(finalSubject, vars);
    finalBodyHtml = interpolateVariables(finalBodyHtml, vars);
    if (finalBodyText) {
      finalBodyText = interpolateVariables(finalBodyText, vars);
    }

    // Add to queue
    const queueResult = await query(
      `INSERT INTO email_queue 
       (organization_id, sender_user_id, template_id, to_email, to_name, cc, bcc, 
        subject, body_html, body_text, context_type, context_id, variables, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
       RETURNING *`,
      [org.organization_id, req.userId, template_id, to_email, to_name, cc || [], bcc || [],
       finalSubject, finalBodyHtml, finalBodyText, context_type, context_id, JSON.stringify(vars)]
    );

    const queueItem = queueResult.rows[0];

    // If send_immediately, process now
    if (send_immediately) {
      try {
        const smtpConfig = await getSmtpConfig(req.userId, org.organization_id);
        
        if (!smtpConfig) {
          return res.status(400).json({ error: 'Nenhuma configuração SMTP disponível' });
        }

        const transporter = createTransporter(smtpConfig);

        // Build attachments for nodemailer
        const mailAttachments = (attachments || []).map(att => ({
          filename: att.file_name,
          path: att.file_url,
        }));

        await transporter.sendMail({
          from: `"${smtpConfig.from_name}" <${smtpConfig.from_email}>`,
          to: to_name ? `"${to_name}" <${to_email}>` : to_email,
          cc: cc?.join(', '),
          bcc: bcc?.join(', '),
          replyTo: smtpConfig.reply_to,
          subject: finalSubject,
          html: finalBodyHtml,
          text: finalBodyText,
          attachments: mailAttachments.length > 0 ? mailAttachments : undefined,
        });

        // Update queue status
        await query(
          `UPDATE email_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [queueItem.id]
        );

        // Add to history
        await query(
          `INSERT INTO email_history 
           (organization_id, queue_id, sender_user_id, to_email, subject, context_type, context_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent')`,
          [org.organization_id, queueItem.id, req.userId, to_email, finalSubject, context_type, context_id]
        );

        res.json({ success: true, status: 'sent', queue_id: queueItem.id });
      } catch (sendError) {
        // Update queue with error
        await query(
          `UPDATE email_queue SET status = 'failed', error_message = $1 WHERE id = $2`,
          [sendError.message, queueItem.id]
        );

        res.status(500).json({ error: `Falha ao enviar: ${sendError.message}` });
      }
    } else {
      res.json({ success: true, status: 'queued', queue_id: queueItem.id });
    }
  } catch (error) {
    logError('Error sending email:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get email history for context
router.get('/history/:contextType/:contextId', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `SELECT h.*, u.name as sender_name
       FROM email_history h
       LEFT JOIN users u ON u.id = h.sender_user_id
       WHERE h.organization_id = $1 AND h.context_type = $2 AND h.context_id = $3
       ORDER BY h.created_at DESC
       LIMIT 50`,
      [org.organization_id, req.params.contextType, req.params.contextId]
    );

    res.json(result.rows);
  } catch (error) {
    logError('Error fetching email history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check SMTP status (for UI indicators)
router.get('/smtp/status', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const smtpConfig = await getSmtpConfig(req.userId, org.organization_id);

    res.json({
      configured: !!smtpConfig,
      source: smtpConfig?.source || null,
      verified: smtpConfig?.is_verified || false,
      from_email: smtpConfig?.from_email || null,
    });
  } catch (error) {
    logError('Error checking SMTP status:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
