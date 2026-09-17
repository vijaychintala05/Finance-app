import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { EmailOutboxService } from '../services/EmailOutboxService';

describe('Email outbox dead-letter cleanup', () => {
  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    db.initPgMem();
    await MigrationRunner.runMigrations();
    EmailOutboxService.setCustomSender(null);
  });

  it('moves an expired maximum-retry lease to DEAD_LETTER before either worker can dispatch it', async () => {
    const send = vi.fn(async () => ({ success: true }));
    EmailOutboxService.setCustomSender(send);

    const emailId = await EmailOutboxService.enqueueEmail(
      'dead-letter@firmbooks.local',
      'OPERATIONAL_ALERT',
      { event: 'LEASE_EXPIRY_QUALIFICATION' },
      'org_outbox_qualification'
    );

    await db.query(
      `UPDATE outbox_emails
          SET delivery_status = 'PROCESSING',
              lease_owner = 'crashed-worker',
              lease_expires_at = '2020-01-01T00:00:00.000Z',
              retry_count = max_retries
        WHERE id = $1`,
      [emailId]
    );

    const [firstWorker, secondWorker] = await Promise.all([
      EmailOutboxService.processOutbox(10, 300, 'worker-a'),
      EmailOutboxService.processOutbox(10, 300, 'worker-b'),
    ]);

    expect(firstWorker.processed + secondWorker.processed).toBe(0);
    expect(send).not.toHaveBeenCalled();

    const row = await db.query(
      `SELECT delivery_status, last_error FROM outbox_emails WHERE id = $1`,
      [emailId]
    );
    expect(row.rows[0].delivery_status).toBe('DEAD_LETTER');
    expect(row.rows[0].last_error).toContain('Lease expired at maximum retries');
  });
});
