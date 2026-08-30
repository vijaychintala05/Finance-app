import nodemailer from 'nodemailer';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { isProduction } from '../config/environment';

export interface OutboxEmailRecord {
  id: string;
  organizationId?: string;
  recipientEmail: string;
  templateType: 'INVITATION' | 'VERIFY_EMAIL' | 'PASSWORD_RESET' | 'SECURITY_ALERT';
  payload: any;
  deliveryStatus: 'PENDING' | 'SENT' | 'FAILED' | 'RETRYING';
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  nextRetryAt: string;
  sentAt?: string;
  createdAt: string;
}

export type EmailSender = (email: OutboxEmailRecord) => Promise<{ success: boolean; error?: string }>;

export class EmailOutboxService {
  private static transporter: nodemailer.Transporter | null = null;
  private static customSender: EmailSender | null = null;
  private static workerTimer: NodeJS.Timeout | null = null;
  private static isProcessing: boolean = false;

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
    // Unref timer so it doesn't block node process exit in tests
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
    templateType: OutboxEmailRecord['templateType'],
    payload: Record<string, any>,
    organizationId?: string
  ): Promise<string> {
    const id = newId('outbox');
    await db.query(
      `INSERT INTO outbox_emails (id, organization_id, recipient_email, template_type, payload, delivery_status, retry_count, max_retries, next_retry_at)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, 5, CURRENT_TIMESTAMP)`,
      [id, organizationId || null, recipientEmail.toLowerCase().trim(), templateType, JSON.stringify(payload)]
    );

    return id;
  }

  public static async processOutbox(batchSize: number = 10): Promise<{ processed: number; successful: number; failed: number }> {
    // Atomically claim eligible rows into PROCESSING state to prevent concurrent workers from double-sending
    const claimedRows = await db.transaction(async (client) => {
      const nowIso = new Date().toISOString();
      const res = await client.query(
        `UPDATE outbox_emails
         SET delivery_status = 'PROCESSING'
         WHERE id IN (
           SELECT id FROM outbox_emails
           WHERE delivery_status IN ('PENDING', 'RETRYING')
             AND (next_retry_at IS NULL OR next_retry_at <= $1)
             AND retry_count < max_retries
           ORDER BY created_at ASC
           LIMIT $2
         )
         RETURNING id, organization_id, recipient_email, template_type, payload, delivery_status, retry_count, max_retries, last_error, next_retry_at, sent_at, created_at`,
        [nowIso, batchSize]
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
        lastError: row.last_error,
        nextRetryAt: row.next_retry_at,
        sentAt: row.sent_at,
        createdAt: row.created_at,
      };

      try {
        let dispatchResult: { success: boolean; error?: string };

        if (EmailOutboxService.customSender) {
          dispatchResult = await EmailOutboxService.customSender(email);
        } else {
          dispatchResult = await EmailOutboxService.defaultDispatch(email);
        }

        if (dispatchResult.success) {
          await db.query(
            `UPDATE outbox_emails SET delivery_status = 'SENT', sent_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = $1`,
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

  private static async defaultDispatch(email: OutboxEmailRecord): Promise<{ success: boolean; error?: string }> {
    const transporter = EmailOutboxService.getTransporter();

    if (transporter) {
      const from = process.env.SMTP_FROM || '"FirmBooks Security" <security@firmbooks.local>';
      let subject = 'FirmBooks Notification';
      let html = `<p>${JSON.stringify(email.payload)}</p>`;

      if (email.templateType === 'INVITATION') {
        subject = 'You have been invited to FirmBooks';
        html = `<p>You have been invited with role <strong>${email.payload.role}</strong>.</p><p><a href="${email.payload.inviteLink}">Accept Invitation</a></p>`;
      } else if (email.templateType === 'PASSWORD_RESET') {
        subject = 'FirmBooks Password Reset Request';
        html = `<p>Click below to reset your password. This link expires in 1 hour:</p><p><a href="${email.payload.resetLink}">Reset Password</a></p>`;
      } else if (email.templateType === 'SECURITY_ALERT') {
        subject = 'FirmBooks Security Alert';
        html = `<p>A security event was recorded: <strong>${email.payload.event}</strong></p>`;
      }

      await transporter.sendMail({
        from,
        to: email.recipientEmail,
        subject,
        html,
      });

      return { success: true };
    }

    // In production mode, lack of SMTP configuration MUST fail delivery rather than reporting fake success
    if (isProduction()) {
      return {
        success: false,
        error: 'SMTP_NOT_CONFIGURED: Production email delivery requires SMTP_HOST and credentials',
      };
    }

    // In development or test mode without SMTP, record delivery to logger
    return { success: true };
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
       SET delivery_status = $1, retry_count = $2, last_error = $3, next_retry_at = $4
       WHERE id = $5`,
      [status, nextRetryCount, errorMessage, nextRetryDate, email.id]
    );
  }

  public static async listOutbox(organizationId?: string, limit: number = 50): Promise<OutboxEmailRecord[]> {
    let query = `SELECT id, organization_id, recipient_email, template_type, payload, delivery_status, retry_count, max_retries, last_error, next_retry_at, sent_at, created_at
                 FROM outbox_emails`;
    const params: any[] = [];

    if (organizationId) {
      query += ` WHERE organization_id = $1`;
      params.push(organizationId);
      query += ` ORDER BY created_at DESC LIMIT $2`;
      params.push(limit);
    } else {
      query += ` ORDER BY created_at DESC LIMIT $1`;
      params.push(limit);
    }

    const res = await db.query(query, params);

    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      recipientEmail: row.recipient_email,
      templateType: row.template_type,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      deliveryStatus: row.delivery_status,
      retryCount: Number(row.retry_count || 0),
      maxRetries: Number(row.max_retries || 5),
      lastError: row.last_error,
      nextRetryAt: row.next_retry_at,
      sentAt: row.sent_at,
      createdAt: row.created_at,
    }));
  }
}
