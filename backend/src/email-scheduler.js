import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { query } from './db.js';
import { logInfo, logError } from './logger.js';

// Encryption key
const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'whatsale-email-key-32chars!!';
const ALGORITHM = 'aes-256-cbc';

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

// Get SMTP config for user/org
async function getSmtpConfig(userId, organizationId) {
  // First check user-specific config
  if (userId) {
    const userConfig = await query(
      `SELECT * FROM email_user_smtp_configs 
       WHERE user_id = $1 AND organization_id = $2 AND is_active = true`,
      [userId, organizationId]
    );

    if (userConfig.rows[0]) {
      return userConfig.rows[0];
    }
  }

  // Fall back to org config
  const orgConfig = await query(
    `SELECT * FROM email_smtp_configs 
     WHERE organization_id = $1 AND is_active = true`,
    [organizationId]
  );

  return orgConfig.rows[0] || null;
}

// Create nodemailer transporter
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
      // Allow self-signed / hostname-mismatched certs (common on shared hosting)
      rejectUnauthorized: false,
      servername: config.host,
    },
  });
}

// Process pending emails in queue
export async function processEmailQueue() {
  logInfo('📧 [EMAIL-QUEUE] Processing pending emails...');

  const stats = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  try {
    // Get pending emails that are due
    const pendingEmails = await query(
      `SELECT eq.*, o.name as org_name
       FROM email_queue eq
       JOIN organizations o ON o.id = eq.organization_id
       WHERE eq.status = 'pending' 
         AND eq.scheduled_at <= NOW()
         AND eq.retry_count < eq.max_retries
       ORDER BY eq.priority ASC, eq.scheduled_at ASC
       LIMIT 20`
    );

    for (const email of pendingEmails.rows) {
      stats.processed++;

      try {
        // Get SMTP config
        const smtpConfig = await getSmtpConfig(email.sender_user_id, email.organization_id);

        if (!smtpConfig) {
          logError(`No SMTP config for org ${email.org_name}, skipping email ${email.id}`);
          stats.skipped++;
          
          await query(
            `UPDATE email_queue SET 
               status = 'failed', 
               error_message = 'Nenhuma configuração SMTP disponível',
               updated_at = NOW()
             WHERE id = $1`,
            [email.id]
          );
          continue;
        }

        // Mark as sending
        await query(
          `UPDATE email_queue SET status = 'sending', updated_at = NOW() WHERE id = $1`,
          [email.id]
        );

        // Create transporter and send
        const transporter = createTransporter(smtpConfig);

        // Build attachments (supports [{filename, path|url|href|content}])
        let mailAttachments;
        try {
          const raw = email.attachments;
          const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw ? JSON.parse(raw) : []);
          mailAttachments = (arr || []).map(a => ({
            filename: a.filename || a.file_name || 'anexo',
            path: a.path || a.file_url || a.url,
            content: a.content,
            contentType: a.contentType || a.file_type,
          })).filter(a => a.path || a.content);
        } catch { mailAttachments = undefined; }

        await transporter.sendMail({
          from: `"${smtpConfig.from_name}" <${smtpConfig.from_email}>`,
          to: email.to_name ? `"${email.to_name}" <${email.to_email}>` : email.to_email,
          cc: email.cc?.length > 0 ? email.cc.join(', ') : undefined,
          bcc: email.bcc?.length > 0 ? email.bcc.join(', ') : undefined,
          replyTo: smtpConfig.reply_to,
          subject: email.subject,
          html: email.body_html,
          text: email.body_text,
          attachments: mailAttachments && mailAttachments.length ? mailAttachments : undefined,
        });

        // Mark as sent
        await query(
          `UPDATE email_queue SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [email.id]
        );

        // Add to history
        await query(
          `INSERT INTO email_history 
           (organization_id, queue_id, sender_user_id, to_email, subject, context_type, context_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent')`,
          [email.organization_id, email.id, email.sender_user_id, email.to_email, 
           email.subject, email.context_type, email.context_id]
        );

        stats.sent++;
        logInfo(`📧 Email sent to ${email.to_email}`);

      } catch (sendError) {
        stats.failed++;
        logError(`Failed to send email ${email.id}:`, sendError);

        // Update with error and increment retry
        await query(
          `UPDATE email_queue SET 
             status = 'pending', 
             error_message = $1,
             retry_count = retry_count + 1,
             updated_at = NOW()
           WHERE id = $2`,
          [sendError.message, email.id]
        );

        // If max retries reached, mark as failed
        const updated = await query(
          `SELECT retry_count, max_retries FROM email_queue WHERE id = $1`,
          [email.id]
        );

        if (updated.rows[0] && updated.rows[0].retry_count >= updated.rows[0].max_retries) {
          await query(
            `UPDATE email_queue SET status = 'failed', updated_at = NOW() WHERE id = $1`,
            [email.id]
          );

          // Add to history as failed
          await query(
            `INSERT INTO email_history 
             (organization_id, queue_id, sender_user_id, to_email, subject, context_type, context_id, status, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'failed', $8)`,
            [email.organization_id, email.id, email.sender_user_id, email.to_email, 
             email.subject, email.context_type, email.context_id, sendError.message]
          );
        }
      }

      // Small delay between sends to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    logInfo('📧 [EMAIL-QUEUE] Complete:', stats);
    return stats;
  } catch (error) {
    logError('📧 [EMAIL-QUEUE] Error:', error);
    throw error;
  }
}

// Send email immediately (for flow actions)
export async function sendEmailImmediately({
  organizationId,
  senderUserId,
  toEmail,
  toName,
  subject,
  bodyHtml,
  bodyText,
  contextType,
  contextId,
  variables,
}) {
  try {
    // Get SMTP config
    const smtpConfig = await getSmtpConfig(senderUserId, organizationId);

    if (!smtpConfig) {
      throw new Error('Nenhuma configuração SMTP disponível');
    }

    // Interpolate variables
    let finalSubject = subject;
    let finalBodyHtml = bodyHtml;
    let finalBodyText = bodyText;

    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
        finalSubject = finalSubject.replace(regex, value || '');
        finalBodyHtml = finalBodyHtml.replace(regex, value || '');
        if (finalBodyText) {
          finalBodyText = finalBodyText.replace(regex, value || '');
        }
      }
    }

    // Create transporter and send
    const transporter = createTransporter(smtpConfig);

    await transporter.sendMail({
      from: `"${smtpConfig.from_name}" <${smtpConfig.from_email}>`,
      to: toName ? `"${toName}" <${toEmail}>` : toEmail,
      replyTo: smtpConfig.reply_to,
      subject: finalSubject,
      html: finalBodyHtml,
      text: finalBodyText,
    });

    // Add to history
    await query(
      `INSERT INTO email_history 
       (organization_id, sender_user_id, to_email, subject, context_type, context_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'sent')`,
      [organizationId, senderUserId, toEmail, finalSubject, contextType, contextId]
    );

    logInfo(`📧 Email sent immediately to ${toEmail}`);
    return { success: true };
  } catch (error) {
    logError('Error sending email immediately:', error);
    throw error;
  }
}

// Queue email for later sending (for flows - async mode)
export async function queueEmail({
  organizationId,
  senderUserId,
  templateId,
  toEmail,
  toName,
  subject,
  bodyHtml,
  bodyText,
  contextType,
  contextId,
  variables,
  scheduledAt,
}) {
  try {
    // If using template, load it
    let finalSubject = subject;
    let finalBodyHtml = bodyHtml;
    let finalBodyText = bodyText;

    if (templateId) {
      const templateResult = await query(
        `SELECT * FROM email_templates WHERE id = $1`,
        [templateId]
      );

      if (templateResult.rows[0]) {
        const template = templateResult.rows[0];
        finalSubject = finalSubject || template.subject;
        finalBodyHtml = finalBodyHtml || template.body_html;
        finalBodyText = finalBodyText || template.body_text;
      }
    }

    // Interpolate variables
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
        finalSubject = finalSubject.replace(regex, value || '');
        finalBodyHtml = finalBodyHtml.replace(regex, value || '');
        if (finalBodyText) {
          finalBodyText = finalBodyText.replace(regex, value || '');
        }
      }
    }

    // Add to queue
    const result = await query(
      `INSERT INTO email_queue 
       (organization_id, sender_user_id, template_id, to_email, to_name, 
        subject, body_html, body_text, context_type, context_id, variables, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()))
       RETURNING id`,
      [organizationId, senderUserId, templateId, toEmail, toName,
       finalSubject, finalBodyHtml, finalBodyText, contextType, contextId, 
       JSON.stringify(variables || {}), scheduledAt]
    );

    logInfo(`📧 Email queued for ${toEmail}`);
    return { success: true, queueId: result.rows[0].id };
  } catch (error) {
    logError('Error queuing email:', error);
    throw error;
  }
}
