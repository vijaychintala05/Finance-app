import nodemailer from 'nodemailer';
import { createHash } from 'node:crypto';
import { db, type DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';

export type EmailTemplateType =
  | 'INVITATION'
  | 'VERIFY_EMAIL'
  | 'PASSWORD_RESET'
  | 'SECURITY_ALERT'
  | 'INVOICE_REMINDER'
  | 'INVOICE_SEND'
  | 'APPROVAL_NOTIFICATION'
  | 'OPERATIONAL_ALERT';

export interface OutboxEmailRecord {
  id: string;
  organizationId?: string;
  recipientEmail: string;
  templateType: EmailTemplateType;
  payload: any;
  deliveryStatus: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'RETRYING' | 'DEAD_LETTER' | 'SUPPRESSED';
  retryCount: number;
  maxRetries: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  lastError?: string;
  nextRetryAt: string;
  sentAt?: string;
  createdAt: string;
  invoiceId?: string | null;
  invoiceEmailKind?: 'SEND' | 'REMINDER' | null;
}

export interface InvoiceEmailAttachment { filename: string; contentType: string; content: Buffer; }

export type EmailSender = (email: OutboxEmailRecord) => Promise<{ success: boolean; error?: string }>;

export class EmailOutboxService {
  private static transporter: nodemailer.Transporter | null = null;
  private static customSender: EmailSender | null = null;
  private static workerTimer: NodeJS.Timeout | null = null;

  public static setCustomSender(sender: EmailSender | null) {
    EmailOutboxService.customSender = sender;
  }

  public static startOutboxWorker(intervalMs: number = 5000): void {
    if (EmailOutboxService.workerTimer) return;
    EmailOutboxService.workerTimer = setInterval(() => {
      EmailOutboxService.processOutbox().catch((err) => {
        console.error('[EmailOutboxService Worker Error]', err?.message || err);
      });
    }, intervalMs);
    if (EmailOutboxService.workerTimer.unref) {
      EmailOutboxService.workerTimer.unref();
    }
  }

  public static stopOutboxWorker(): void {
    if (EmailOutboxService.workerTimer) {
      clearInterval(EmailOutboxService.workerTimer);
      EmailOutboxService.workerTimer = null;
    }
  }

  public static getTransporter(): nodemailer.Transporter | null {
    if (EmailOutboxService.transporter) return EmailOutboxService.transporter;
    if (process.env.SMTP_HOST) {
      EmailOutboxService.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || '',
        } : undefined,
      });
      return EmailOutboxService.transporter;
    }
    return null;
  }

  public static async enqueueEmail(
    recipientEmail: string,
    templateType: EmailTemplateType,
    payload: Record<string, any>,
    organizationId?: string,
    options: { invoiceId?: string; invoiceEmailKind?: 'SEND' | 'REMINDER'; attachment?: InvoiceEmailAttachment } = {},
    client: DbQueryClient = db
  ): Promise<string> {
    const id = newId('outbox');
    await client.query(
      `INSERT INTO outbox_emails (id, organization_id, recipient_email, template_type, payload, delivery_status, retry_count, max_retries, next_retry_at, invoice_id, invoice_email_kind)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, 5, CURRENT_TIMESTAMP, $6, $7)`,
      [id, organizationId || null, recipientEmail.toLowerCase().trim(), templateType, JSON.stringify(payload), options.invoiceId || null, options.invoiceEmailKind || null]
    );
    if (options.attachment) {
      const attachment = options.attachment;
      const sha256 = createHash('sha256').update(attachment.content).digest('hex');
      await client.query('INSERT INTO outbox_email_attachments (outbox_email_id, filename, content_type, content, sha256) VALUES ($1, $2, $3, $4, $5)', [id, attachment.filename, attachment.contentType, db.isMemoryMode() ? attachment.content.toString('base64') : attachment.content, sha256]);
    }
    return id;
  }

  public static async enqueueInvoiceReminder(
    organizationId: string,
    recipientEmail: string,
    payload: {
      invoiceNumber: string;
      customerName: string;
      amountDue: number;
      dueDate: string;
      currency?: string;
      paymentLink?: string;
    }
  ): Promise<string> {
    return this.enqueueEmail(recipientEmail, 'INVOICE_REMINDER', payload, organizationId);
  }

  public static async enqueueApprovalNotification(
    organizationId: string,
    recipientEmail: string,
    payload: {
      documentType: string;
      documentNumber: string;
      submitterName: string;
      amount: number;
      currency?: string;
      reviewLink?: string;
    }
  ): Promise<string> {
    return this.enqueueEmail(recipientEmail, 'APPROVAL_NOTIFICATION', payload, organizationId);
  }

  public static async enqueueOperationalAlert(
    organizationId: string,
    recipientEmail: string,
    payload: {
      alertType: string;
      message: string;
      severity: 'INFO' | 'WARNING' | 'CRITICAL';
      timestamp?: string;
      details?: any;
    }
  ): Promise<string> {
    return this.enqueueEmail(recipientEmail, 'OPERATIONAL_ALERT', payload, organizationId);
  }

  public static async processOutbox(
    batchSize: number = 10,
    leaseSeconds: number = 300,
    workerId: string = 'outbox-worker'
  ): Promise<{ processed: number; successful: number; failed: number }> {
    const now = new Date(Date.now() + 2000);
    const leaseExpiry = new Date(now.getTime() + leaseSeconds * 1000);

    // 1. Preceding atomic cleanup: transition expired PROCESSING leases at max_retries directly to DEAD_LETTER
    await db.query(
      `UPDATE outbox_emails
          SET delivery_status = 'DEAD_LETTER',
              last_error = COALESCE(last_error, 'Lease expired at maximum retries without completion')
        WHERE delivery_status = 'PROCESSING'
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at < $1
          AND retry_count >= max_retries`,
      [now]
    );

    // Atomically claim eligible rows into PROCESSING state with row lease
    const claimedRows = await db.transaction(async (client) => {
      const candidates = await client.query(
        `SELECT id FROM outbox_emails
         WHERE (
           delivery_status IN ('PENDING', 'RETRYING')
           OR (delivery_status = 'PROCESSING' AND lease_expires_at IS NOT NULL AND lease_expires_at < $1)
         )
           AND (next_retry_at IS NULL OR next_retry_at <= $1)
           AND retry_count < max_retries
         ORDER BY created_at ASC
         LIMIT $2
         FOR UPDATE ${!db.isMemoryMode() ? 'SKIP LOCKED' : ''}`,
        [now, batchSize]
      );

      if (candidates.rows.length === 0) return [];

      const ids = candidates.rows.map((r: any) => r.id);
      const placeholders = ids.map((_, i) => `$${i + 3}`).join(', ');

      const res = await client.query(
        `UPDATE outbox_emails
         SET delivery_status = 'PROCESSING',
             lease_owner = $1,
             lease_expires_at = $2
         WHERE id IN (${placeholders})
         RETURNING id, organization_id, recipient_email, template_type, payload, invoice_id, invoice_email_kind,
                   delivery_status, retry_count, max_retries, lease_owner, lease_expires_at,
                   last_error, next_retry_at, sent_at, created_at`,
        [workerId, leaseExpiry, ...ids]
      );
      return res.rows;
    });

    let successful = 0;
    let failed = 0;

    for (const row of claimedRows) {
      const email: OutboxEmailRecord = {
        id: row.id,
        organizationId: row.organization_id,
        recipientEmail: row.recipient_email,
        templateType: row.template_type,
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
        deliveryStatus: row.delivery_status,
        retryCount: Number(row.retry_count || 0),
        maxRetries: Number(row.max_retries || 5),
        leaseOwner: row.lease_owner,
        leaseExpiresAt: row.lease_expires_at,
        lastError: row.last_error,
        nextRetryAt: row.next_retry_at,
        sentAt: row.sent_at,
        createdAt: row.created_at,
        invoiceId: row.invoice_id || null,
        invoiceEmailKind: row.invoice_email_kind || null,
      };

      try {
        if (email.invoiceId && email.invoiceEmailKind) {
          const invoice = await db.query('SELECT status, balance_due FROM invoices WHERE organization_id = $1 AND id = $2', [email.organizationId, email.invoiceId]);
          const invoiceStatus = String(invoice.rows[0]?.status || '').toUpperCase();
          const voided = ['VOID', 'VOIDED'].includes(invoiceStatus);
          const settled = email.invoiceEmailKind === 'REMINDER' && Number(invoice.rows[0]?.balance_due || 0) <= 0;
          if (!invoice.rows.length || voided || settled) {
            await db.query(`UPDATE outbox_emails SET delivery_status = 'SUPPRESSED', last_error = $1, lease_owner = NULL, lease_expires_at = NULL WHERE id = $2 AND delivery_status = 'PROCESSING'`, [!invoice.rows.length || voided ? 'Invoice is unavailable or voided' : 'Invoice is fully settled', email.id]);
            continue;
          }
        }
        let dispatchResult: { success: boolean; error?: string };

        if (EmailOutboxService.customSender) {
          dispatchResult = await EmailOutboxService.customSender(email);
        } else {
          dispatchResult = await EmailOutboxService.defaultDispatch(email);
        }

        if (dispatchResult.success) {
          await db.query(
            `UPDATE outbox_emails
             SET delivery_status = 'SENT',
                 sent_at = CURRENT_TIMESTAMP,
                 lease_owner = NULL,
                 lease_expires_at = NULL,
                 last_error = NULL
             WHERE id = $1`,
            [email.id]
          );
          successful++;
        } else {
          await EmailOutboxService.handleDispatchFailure(email, dispatchResult.error || 'SMTP Dispatch Failed');
          failed++;
        }
      } catch (err: any) {
        await EmailOutboxService.handleDispatchFailure(email, err?.message || String(err));
        failed++;
      }
    }

    return { processed: claimedRows.length, successful, failed };
  }

  public static async recoverExpiredLeases(): Promise<number> {
    const now = new Date(Date.now() + 2000);
    const res = await db.query(
      `UPDATE outbox_emails
       SET delivery_status = CASE WHEN retry_count + 1 >= max_retries THEN 'FAILED' ELSE 'RETRYING' END,
           lease_owner = NULL,
           lease_expires_at = NULL,
           next_retry_at = CURRENT_TIMESTAMP,
           last_error = 'LEASE_EXPIRED_CRASH_RECOVERY: Worker lost lease'
       WHERE delivery_status = 'PROCESSING'
         AND (lease_expires_at IS NULL OR lease_expires_at <= $1)
       RETURNING id`,
      [now]
    );
    return res.rowCount || 0;
  }

  private static async defaultDispatch(email: OutboxEmailRecord): Promise<{ success: boolean; error?: string }> {
    const transporter = EmailOutboxService.getTransporter();

    if (transporter) {
      const from = process.env.SMTP_FROM || '"FirmBooks" <noreply@firmbooks.local>';
      let subject = 'FirmBooks Notification';
      let html = `<p>${JSON.stringify(email.payload)}</p>`;
      let attachments: nodemailer.SendMailOptions['attachments'];

      switch (email.templateType) {
        case 'INVITATION':
          subject = 'You have been invited to FirmBooks';
          html = `<p>You have been invited with role <strong>${email.payload.role}</strong>.</p><p><a href="${email.payload.inviteLink}">Accept Invitation</a></p>`;
          break;
        case 'PASSWORD_RESET':
          subject = 'FirmBooks Password Reset Request';
          html = `<p>Click below to reset your password. This link expires in 1 hour:</p><p><a href="${email.payload.resetLink}">Reset Password</a></p>`;
          break;
        case 'SECURITY_ALERT':
          subject = 'FirmBooks Security Alert';
          html = `<p>A security event was recorded: <strong>${email.payload.event}</strong></p>`;
          break;
        case 'INVOICE_REMINDER':
          subject = `Reminder: Invoice ${EmailOutboxService.escapeHtml(email.payload.invoiceNumber).replace(/[\r\n\x00-\x1f\x7f]/g, ' ')} is Due`;
          html = `<p>Dear ${EmailOutboxService.escapeHtml(email.payload.customerName)},</p><p>This is a reminder that invoice <strong>${EmailOutboxService.escapeHtml(email.payload.invoiceNumber)}</strong> for amount <strong>${EmailOutboxService.escapeHtml(email.payload.currency || '₹')}${EmailOutboxService.escapeHtml(email.payload.amountDue)}</strong> is due on <strong>${EmailOutboxService.escapeHtml(email.payload.dueDate)}</strong>.</p>${email.payload.paymentLink ? `<p><a href="${EmailOutboxService.escapeHtml(email.payload.paymentLink)}">Pay Now</a></p>` : ''}`;
          break;
        case 'INVOICE_SEND': {
          subject = String(email.payload.subject || `Invoice ${email.payload.invoiceNumber}`);
          html = `<p>Dear ${EmailOutboxService.escapeHtml(email.payload.customerName)},</p><p>Please find invoice <strong>${EmailOutboxService.escapeHtml(email.payload.invoiceNumber)}</strong> attached.</p>${email.payload.customMessage ? `<p>${EmailOutboxService.escapeHtml(email.payload.customMessage).replace(/\n/g, '<br>')}</p>` : ''}`;
          const attachment = await db.query('SELECT filename, content_type, content, sha256 FROM outbox_email_attachments WHERE outbox_email_id = $1', [email.id]);
          if (attachment.rows.length !== 1) return { success: false, error: 'INVOICE_ATTACHMENT_MISSING: Immutable invoice PDF attachment is unavailable' };
          const content = db.isMemoryMode()
            ? Buffer.from(Buffer.isBuffer(attachment.rows[0].content) ? attachment.rows[0].content.toString() : String(attachment.rows[0].content), 'base64')
            : Buffer.from(attachment.rows[0].content);
          const actualDigest = createHash('sha256').update(content).digest('hex');
          if (actualDigest !== attachment.rows[0].sha256) return { success: false, error: 'INVOICE_ATTACHMENT_INTEGRITY: Stored invoice PDF failed its digest check' };
          attachments = [{ filename: attachment.rows[0].filename, content, contentType: attachment.rows[0].content_type }];
          break;
        }
        case 'APPROVAL_NOTIFICATION':
          subject = `Action Required: Approval Needed for ${email.payload.documentType} ${email.payload.documentNumber}`;
          html = `<p>A new ${email.payload.documentType} (<strong>${email.payload.documentNumber}</strong>) submitted by ${email.payload.submitterName} for ${email.payload.currency || '₹'}${email.payload.amount} requires your approval.</p>
                  ${email.payload.reviewLink ? `<p><a href="${email.payload.reviewLink}">Review & Approve</a></p>` : ''}`;
          break;
        case 'OPERATIONAL_ALERT':
          subject = `[${email.payload.severity || 'ALERT'}] ${email.payload.alertType}`;
          html = `<p><strong>${email.payload.alertType}</strong>: ${email.payload.message}</p>
                  ${email.payload.details ? `<pre>${JSON.stringify(email.payload.details, null, 2)}</pre>` : ''}`;
          break;
      }

      await transporter.sendMail({
        from,
        to: email.recipientEmail,
        subject,
        html,
        attachments,
      });

      return { success: true };
    }

    return { success: false, error: 'SMTP_NOT_CONFIGURED: Email delivery requires SMTP_HOST and a configured transport' };
  }

  private static escapeHtml(value: unknown): string {
    const valueText = String(value ?? '');
    return valueText.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll(String.fromCharCode(34), '&quot;').replaceAll(String.fromCharCode(39), '&#39;');
  }

  private static async handleDispatchFailure(email: OutboxEmailRecord, errorMessage: string): Promise<void> {
    const nextRetryCount = email.retryCount + 1;
    const isExhausted = nextRetryCount >= email.maxRetries;
    const status = isExhausted ? 'FAILED' : 'RETRYING';

    // Exponential backoff: 30s * 2^(retryCount)
    const backoffSeconds = Math.pow(2, nextRetryCount) * 30;
    const nextRetryDate = new Date(Date.now() + backoffSeconds * 1000).toISOString();

    await db.query(
      `UPDATE outbox_emails
       SET delivery_status = $1,
           retry_count = $2,
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = $3,
           next_retry_at = $4
       WHERE id = $5`,
      [status, nextRetryCount, errorMessage, nextRetryDate, email.id]
    );
  }

  public static async listOutbox(organizationId?: string, limit: number = 50): Promise<OutboxEmailRecord[]> {
    let query = `SELECT id, organization_id, recipient_email, template_type, payload,
                        delivery_status, retry_count, max_retries, lease_owner, lease_expires_at,
                        last_error, next_retry_at, sent_at, created_at
                 FROM outbox_emails`;
    const params: any[] = [];

    if (organizationId) {
      query += ` WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2`;
      params.push(organizationId, limit);
    } else {
      query += ` ORDER BY created_at DESC LIMIT $1`;
      params.push(limit);
    }

    const res = await db.query(query, params);

    return res.rows.map((row: any) => ({
      id: row.id,
      organizationId: row.organization_id,
      recipientEmail: row.recipient_email,
      templateType: row.template_type,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      deliveryStatus: row.delivery_status,
      retryCount: Number(row.retry_count || 0),
      maxRetries: Number(row.max_retries || 5),
      leaseOwner: row.lease_owner || null,
      leaseExpiresAt: row.lease_expires_at || null,
      lastError: row.last_error,
      nextRetryAt: row.next_retry_at,
      sentAt: row.sent_at,
      createdAt: row.created_at,
    }));
  }
}
