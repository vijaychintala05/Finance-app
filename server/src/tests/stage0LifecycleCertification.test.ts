import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { AuditTrailService } from '../security/AuditTrailService';
import { AccountingIntegrityService } from '../services/AccountingIntegrityService';
import { SalesEngine } from '../sales/SalesEngine';
import { DocumentPdfService } from '../services/DocumentPdfService';
import { RbacService } from '../auth/RbacService';
import { EmailOutboxService } from '../services/EmailOutboxService';
import { FinanceController } from '../controllers/financeController';

describe('Stage 0: Certify Existing Invoice & Expense Lifecycle', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  async function tenant(label: string) {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Lifecycle Test User',
      organizationName: `${label} Lifecycle Corp`,
    });
    return {
      orgId: registration.body.organizationId,
      userId: registration.body.user.id,
      auth: { Authorization: `Bearer ${registration.body.token}` },
    };
  }

  async function fixture(label: string) {
    const context = await tenant(label);
    const client = await request(app)
      .post('/api/v1/finance/clients')
      .set(context.auth)
      .send({ name: `${label} Customer`, email: `${label}@clientcorp.com` });

    const accounts = await db.query(
      'SELECT id, code, name FROM accounts WHERE organization_id = $1',
      [context.orgId]
    );

    const expenseAccount = accounts.rows.find((row) => row.code === '6000') || accounts.rows.find((row) => row.code.startsWith('6'));
    const paymentAccount = accounts.rows.find((row) => row.code === '1000') || accounts.rows.find((row) => row.code.startsWith('10'));

    return {
      ...context,
      client: client.body,
      expenseAccountId: expenseAccount.id,
      paidFromAccountId: paymentAccount.id,
    };
  }

  it('1. sendInvoiceEmail on a DRAFT invoice canonically posts the invoice and creates a balanced journal', async () => {
    const f = await fixture('draft-email-post');

    // Create a billable expense
    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        vendorName: 'Acme Supplies',
        date: '2026-09-01',
        amount: 500.0,
        clientId: f.client.id,
        customerId: f.client.id,
        isBillable: true,
        description: 'Client recoverable travel',
      });
    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;

    // Create a DRAFT invoice directly
    const invRes = await SalesEngine.createAndPostInvoice(f.orgId, {
      customerId: f.client.id,
      customerName: 'Client Customer',
      customerEmail: 'client@clientcorp.com',
      issueDate: '2026-09-02',
      dueDate: '2026-09-15',
      lineItems: [
        { description: 'Recoverable travel reimbursement', quantity: 1, unitPrice: 500.0, taxRate: 0 },
      ],
      status: 'DRAFT',
      createdBy: f.userId,
    } as any, f.userId);

    expect(invRes.status).toBe('DRAFT');
    expect(invRes.journalEntryId).toBeFalsy();

    // Link the expense to this draft invoice
    await db.query(
      `UPDATE expenses SET invoice_id = $1, is_billed = FALSE WHERE organization_id = $2 AND id = $3`,
      [invRes.id, f.orgId, expenseId]
    );

    // Call send-email on the draft invoice
    const sendRes = await request(app)
      .post(`/api/v1/finance/invoices/${invRes.id}/send-email`)
      .set({ ...f.auth, 'Idempotency-Key': 'invoice-email-replay-test-0001' })
      .send({
        recipientEmail: 'client@clientcorp.com',
        subject: 'Your Invoice',
        message: 'Please review and pay.',
      });

    expect(sendRes.status).toBe(202);
    expect(sendRes.body.state).toBe('QUEUED');
    expect(sendRes.body.outboxId).toBeTruthy();
    const replayRes = await request(app).post(`/api/v1/finance/invoices/${invRes.id}/send-email`).set({ ...f.auth, 'Idempotency-Key': 'invoice-email-replay-test-0001' }).send({ recipientEmail: 'client@clientcorp.com', subject: 'Your Invoice', message: 'Please review and pay.' });
    expect(replayRes.status).toBe(202);
    expect(replayRes.body.outboxId).toBe(sendRes.body.outboxId);
    const changedPayloadReplay = await request(app).post(`/api/v1/finance/invoices/${invRes.id}/send-email`).set({ ...f.auth, 'Idempotency-Key': 'invoice-email-replay-test-0001' }).send({ recipientEmail: 'client@clientcorp.com', subject: 'Different subject', message: 'Please review and pay.' });
    expect(changedPayloadReplay.status).toBe(409);
    const duplicateCount = await db.query('SELECT COUNT(*) AS count FROM outbox_emails WHERE organization_id = $1 AND invoice_id = $2 AND invoice_email_kind = $3', [f.orgId, invRes.id, 'SEND']);
    expect(Number(duplicateCount.rows[0].count)).toBe(1);
    const queuedEmail = await db.query('SELECT template_type, invoice_id, invoice_email_kind, delivery_status FROM outbox_emails WHERE id = $1 AND organization_id = $2', [sendRes.body.outboxId, f.orgId]);
    expect(queuedEmail.rows[0]).toMatchObject({ template_type: 'INVOICE_SEND', invoice_id: invRes.id, invoice_email_kind: 'SEND', delivery_status: 'PENDING' });
    const attachment = await db.query('SELECT filename, content_type, content, sha256 FROM outbox_email_attachments WHERE outbox_email_id = $1', [sendRes.body.outboxId]);
    expect(attachment.rows).toHaveLength(1);
    expect(attachment.rows[0].content_type).toBe('application/pdf');
    expect(Buffer.from(Buffer.isBuffer(attachment.rows[0].content) ? attachment.rows[0].content.toString() : attachment.rows[0].content, 'base64').subarray(0, 4).toString()).toBe('%PDF');
    const retained = await db.query("SELECT id, pdf_sha256 FROM document_render_snapshots WHERE organization_id = $1 AND category = 'invoices' AND document_id = $2 AND artifact_state = 'ISSUED' ORDER BY issuance_number DESC LIMIT 1", [f.orgId, invRes.id]);
    expect(retained.rows).toHaveLength(1);
    expect(attachment.rows[0].sha256).toBe(retained.rows[0].pdf_sha256);
    const retainedPdf = await request(app).get('/api/v1/finance/documents/invoices/artifacts/' + retained.rows[0].id + '/pdf').set(f.auth);
    expect(retainedPdf.status).toBe(200);
    expect(Buffer.from(Buffer.isBuffer(attachment.rows[0].content) ? attachment.rows[0].content.toString() : attachment.rows[0].content, 'base64')).toEqual(Buffer.from(retainedPdf.body));
    const history = await request(app).get(`/api/v1/finance/invoices/${invRes.id}/email-deliveries`).set(f.auth);
    expect(history.status).toBe(200);
    expect(history.body.deliveries[0]).toMatchObject({ id: sendRes.body.outboxId, kind: 'SEND', status: 'PENDING' });
    expect(history.body.deliveries[0]).not.toHaveProperty('lastError');

    // Verify invoice is now POSTED with a certified journal
    const invoiceAfter = await db.query(
      `SELECT status, journal_entry_id, total_amount, balance_due FROM invoices WHERE organization_id = $1 AND id = $2`,
      [f.orgId, invRes.id]
    );
    expect(invoiceAfter.rows[0].status).toBe('POSTED');
    expect(invoiceAfter.rows[0].journal_entry_id).toBeTruthy();

    // Verify journal lines exist and balance
    const journalLines = await db.query(
      `SELECT debit, credit, account_code FROM journal_lines WHERE organization_id = $1 AND journal_entry_id = $2`,
      [f.orgId, invoiceAfter.rows[0].journal_entry_id]
    );
    expect(journalLines.rows.length).toBeGreaterThanOrEqual(2);
    const totalDebit = journalLines.rows.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = journalLines.rows.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(500.0);
    expect(totalCredit).toBe(500.0);

    // Verify linked expense was marked is_billed = true
    const expAfter = await db.query(
      `SELECT is_billed, invoice_id FROM expenses WHERE organization_id = $1 AND id = $2`,
      [f.orgId, expenseId]
    );
    expect(expAfter.rows[0].is_billed).toBe(true);
    expect(expAfter.rows[0].invoice_id).toBe(invRes.id);

    // Verify customer receivables_balance increased
    const custAfter = await db.query(
      `SELECT receivables_balance FROM customers WHERE organization_id = $1 AND id = $2`,
      [f.orgId, f.client.id]
    );
    expect(Number(custAfter.rows[0].receivables_balance)).toBe(500.0);
  });

  it('emails a new immutable PDF when the latest issued artifact is stale after an invoice edit', async () => {
    const f = await fixture('invoice-email-stale-pdf');
    const invoice = await SalesEngine.createAndPostInvoice(f.orgId, {
      customerId: f.client.id, customerName: 'Revision Customer', customerEmail: 'revision@example.com',
      issueDate: '2026-09-02', dueDate: '2026-09-15',
      lineItems: [{ description: 'Original revision', quantity: 1, unitPrice: 125, taxRate: 0 }],
      status: 'DRAFT', createdBy: f.userId,
    } as any, f.userId);
    await SalesEngine.postInvoice(f.orgId, f.userId, invoice.id);
    const initialRevision = await db.query('SELECT edit_version FROM invoices WHERE organization_id = $1 AND id = $2', [f.orgId, invoice.id]);
    const originalRevision = Number(initialRevision.rows[0].edit_version);
    const original = await DocumentPdfService.issuePdf(
      f.orgId, 'invoices', invoice.id, f.userId, 'stale-email-pdf-original-0001', undefined,
      { reason: 'Before invoice revision' },
    );

    await SalesEngine.updateInvoice(f.orgId, invoice.id, {
      lineItems: [{ description: 'Revised invoice content', quantity: 1, unitPrice: 175, taxRate: 0 }],
      editReason: 'Corrected invoice before emailing',
    }, f.userId, String(originalRevision));
    const revisedState = await db.query('SELECT status, edit_version FROM invoices WHERE organization_id = $1 AND id = $2', [f.orgId, invoice.id]);
    expect(String(revisedState.rows[0].status).toUpperCase()).toBe('OVERDUE');

    const sent = await request(app).post('/api/v1/finance/invoices/' + invoice.id + '/send-email')
      .set({ ...f.auth, 'Idempotency-Key': 'stale-email-pdf-send-0001' })
      .send({ recipientEmail: 'revision@example.com' });
    expect(sent.status).toBe(202);

    const artifacts = await db.query(
      "SELECT id, issuance_number, source_revision_ref, pdf_sha256 FROM document_render_snapshots WHERE organization_id = $1 AND category = 'invoices' AND document_id = $2 AND artifact_state = 'ISSUED' ORDER BY issuance_number",
      [f.orgId, invoice.id],
    );
    expect(artifacts.rows).toHaveLength(2);
    expect(artifacts.rows[0].id).toBe(original.id);
    expect(String(artifacts.rows[0].source_revision_ref)).toBe(String(originalRevision));
    expect(String(artifacts.rows[1].source_revision_ref)).toBe(String(originalRevision + 1));

    const attachment = await db.query(
      'SELECT content, sha256 FROM outbox_email_attachments WHERE outbox_email_id = $1',
      [sent.body.outboxId],
    );
    expect(attachment.rows).toHaveLength(1);
    expect(attachment.rows[0].sha256).toBe(artifacts.rows[1].pdf_sha256);
    const oldArtifact = await request(app).get('/api/v1/finance/documents/invoices/artifacts/' + original.id + '/pdf').set(f.auth);
    expect(oldArtifact.status).toBe(200);
    expect(oldArtifact.headers['x-document-pdf-sha256']).toBe(artifacts.rows[0].pdf_sha256);
  });
  it('rolls back draft posting, balances, outbox, and audit if PDF snapshot rendering fails', async () => {
    const f = await fixture('invoice-email-rollback');
    const invoice = await SalesEngine.createAndPostInvoice(f.orgId, {
      customerId: f.client.id, customerName: 'Rollback Customer', customerEmail: 'rollback@example.com',
      issueDate: '2026-09-02', dueDate: '2026-09-15',
      lineItems: [{ description: 'Rollback item', quantity: 1, unitPrice: 275, taxRate: 0 }], status: 'DRAFT', createdBy: f.userId,
    } as any, f.userId);
    const balanceBefore = await db.query('SELECT receivables_balance FROM customers WHERE organization_id = $1 AND id = $2', [f.orgId, f.client.id]);
    const pdfSpy = vi.spyOn(DocumentPdfService, 'issuePdf').mockRejectedValueOnce(new Error('PDF snapshot failure'));
    let response: any;
    try {
      response = await request(app).post('/api/v1/finance/invoices/' + invoice.id + '/send-email')
        .set({ ...f.auth, 'Idempotency-Key': 'invoice-email-rollback-test-0001' })
        .send({ recipientEmail: 'rollback@example.com' });
    } finally { pdfSpy.mockRestore(); }
    expect(response.status).toBe(500);
    const persisted = await db.query('SELECT status, journal_entry_id FROM invoices WHERE organization_id = $1 AND id = $2', [f.orgId, invoice.id]);
    expect(persisted.rows[0]).toMatchObject({ status: 'DRAFT', journal_entry_id: null });
    const balanceAfter = await db.query('SELECT receivables_balance FROM customers WHERE organization_id = $1 AND id = $2', [f.orgId, f.client.id]);
    expect(Number(balanceAfter.rows[0].receivables_balance)).toBe(Number(balanceBefore.rows[0].receivables_balance));
    const queued = await db.query('SELECT id FROM outbox_emails WHERE organization_id = $1 AND invoice_id = $2', [f.orgId, invoice.id]);
    const audit = await db.query("SELECT id FROM audit_logs WHERE organization_id = $1 AND entity_id = $2 AND action = 'INVOICE_EMAIL_QUEUED'", [f.orgId, invoice.id]);
    expect(queued.rows).toHaveLength(0);
    expect(audit.rows).toHaveLength(0);
  });

  it('requires send permission and separate posting authority for a draft send', async () => {
    const f = await fixture('invoice-email-send-permission');
    const invoice = await SalesEngine.createAndPostInvoice(f.orgId, {
      customerId: f.client.id, customerName: 'Permission Customer', customerEmail: 'permission@example.com',
      issueDate: '2026-09-02', dueDate: '2026-09-15', lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, taxRate: 0 }],
      status: 'DRAFT', createdBy: f.userId,
    } as any, f.userId);
    const permissionSpy = vi.spyOn(RbacService, 'hasPermissionAsync').mockImplementation(async (_org, _role, permission) => permission === 'invoices.send');
    try {
      const sendOnly = await request(app).post('/api/v1/finance/invoices/' + invoice.id + '/send-email').set(f.auth).send({ recipientEmail: 'permission@example.com' });
      expect(sendOnly.status).toBe(403);
      permissionSpy.mockImplementation(async (_org, _role, permission) => permission === 'invoices.view');
      const viewOnly = await request(app).post('/api/v1/finance/invoices/' + invoice.id + '/send-email').set(f.auth).send({ recipientEmail: 'permission@example.com' });
      expect(viewOnly.status).toBe(403);
      const beforeAuthorizedSend = await db.query('SELECT status, journal_entry_id FROM invoices WHERE organization_id = $1 AND id = $2', [f.orgId, invoice.id]);
      expect(beforeAuthorizedSend.rows[0]).toMatchObject({ status: 'DRAFT', journal_entry_id: null });
      permissionSpy.mockImplementation(async (_org, _role, permission) => permission === 'invoices.send' || permission === 'invoices.create');
      const key = 'invoice-email-revoked-permission-0001';
      const queued = await request(app).post('/api/v1/finance/invoices/' + invoice.id + '/send-email').set({ ...f.auth, 'Idempotency-Key': key }).send({ recipientEmail: 'permission@example.com' });
      expect(queued.status).toBe(202);
      permissionSpy.mockImplementation(async (_org, _role, permission) => permission === 'invoices.view');
      const revokedReplay = await request(app).post('/api/v1/finance/invoices/' + invoice.id + '/send-email').set({ ...f.auth, 'Idempotency-Key': key }).send({ recipientEmail: 'permission@example.com' });
      expect(revokedReplay.status).toBe(403);
    } finally { permissionSpy.mockRestore(); }
    const after = await db.query('SELECT status, journal_entry_id FROM invoices WHERE organization_id = $1 AND id = $2', [f.orgId, invoice.id]);
    expect(after.rows[0].status).toBe('POSTED');
    expect(after.rows[0].journal_entry_id).toBeTruthy();
  });

  it('keeps invoice email send and delivery history tenant scoped', async () => {
    const owner = await fixture('invoice-email-tenant-owner');
    const other = await fixture('invoice-email-tenant-other');
    const invoice = await SalesEngine.createAndPostInvoice(owner.orgId, {
      customerId: owner.client.id, customerName: 'Tenant Customer', customerEmail: 'tenant@example.com',
      issueDate: '2026-09-02', dueDate: '2026-09-15', lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, taxRate: 0 }],
      status: 'DRAFT', createdBy: owner.userId,
    } as any, owner.userId);
    const history = await request(app).get('/api/v1/finance/invoices/' + invoice.id + '/email-deliveries').set(other.auth);
    const send = await request(app).post('/api/v1/finance/invoices/' + invoice.id + '/send-email').set(other.auth).send({ recipientEmail: 'tenant@example.com' });
    expect(history.status).toBe(404);
    expect(send.status).toBe(404);
    const unchanged = await db.query('SELECT status FROM invoices WHERE organization_id = $1 AND id = $2', [owner.orgId, invoice.id]);
    expect(unchanged.rows[0].status).toBe('DRAFT');
  });

  it('suppresses queued invoice messages after the invoice is voided', async () => {
    const f = await fixture('invoice-email-suppression');
    const invoice = await SalesEngine.createAndPostInvoice(f.orgId, {
      customerId: f.client.id, customerName: 'Suppression Customer', customerEmail: 'suppress@example.com',
      issueDate: '2026-09-02', dueDate: '2026-09-15', lineItems: [{ description: 'Item', quantity: 1, unitPrice: 120, taxRate: 0 }],
      status: 'DRAFT', createdBy: f.userId,
    } as any, f.userId);
    await SalesEngine.postInvoice(f.orgId, f.userId, invoice.id);
    await FinancialDestructiveActionsService.voidInvoice(f.orgId, invoice.id, f.userId, 'Test void before pending email delivery');
    const outboxId = await EmailOutboxService.enqueueEmail('suppress@example.com', 'INVOICE_SEND', { invoiceNumber: invoice.invoiceNumber, customerName: 'Suppression Customer' }, f.orgId, { invoiceId: invoice.id, invoiceEmailKind: 'SEND' });
    await db.query("UPDATE outbox_emails SET delivery_status = 'FAILED' WHERE id <> $1 AND delivery_status IN ('PENDING', 'RETRYING')", [outboxId]);
    const sender = vi.fn().mockResolvedValue({ success: true });
    EmailOutboxService.setCustomSender(sender);
    try {
      await EmailOutboxService.processOutbox(10);
      const row = await db.query('SELECT delivery_status FROM outbox_emails WHERE organization_id = $1 AND id = $2', [f.orgId, outboxId]);
      expect(row.rows[0].delivery_status).toBe('SUPPRESSED');
      expect(sender).not.toHaveBeenCalled();
    } finally { EmailOutboxService.setCustomSender(null); }
  });

  it('rolls back invoice posting, PDF attachment, outbox, balances, and audit when final audit write fails', async () => {
    const f = await fixture('invoice-email-audit-rollback');
    const invoice = await SalesEngine.createAndPostInvoice(f.orgId, {
      customerId: f.client.id, customerName: 'Audit Failure Customer', customerEmail: 'audit-failure@example.com',
      issueDate: '2026-09-02', dueDate: '2026-09-15', lineItems: [{ description: 'Audit rollback item', quantity: 1, unitPrice: 425, taxRate: 0 }],
      status: 'DRAFT', createdBy: f.userId,
    } as any, f.userId);
    const balanceBefore = await db.query('SELECT receivables_balance FROM customers WHERE organization_id = $1 AND id = $2', [f.orgId, f.client.id]);
    const originalAudit = FinanceController.logAudit;
    const auditSpy = vi.spyOn(FinanceController, 'logAudit').mockImplementation(async (org, user, action, entity, entityId, state, client, strict) => {
      if (action === 'INVOICE_EMAIL_QUEUED') throw new Error('audit sink failure');
      return originalAudit(org, user, action, entity, entityId, state, client, strict);
    });
    let response: any;
    try {
      response = await request(app).post('/api/v1/finance/invoices/' + invoice.id + '/send-email')
        .set({ ...f.auth, 'Idempotency-Key': 'invoice-email-audit-rollback-0001' })
        .send({ recipientEmail: 'audit-failure@example.com' });
    } finally { auditSpy.mockRestore(); }
    expect(response.status).toBe(500);
    const persisted = await db.query('SELECT status, journal_entry_id FROM invoices WHERE organization_id = $1 AND id = $2', [f.orgId, invoice.id]);
    expect(persisted.rows[0]).toMatchObject({ status: 'DRAFT', journal_entry_id: null });
    const balanceAfter = await db.query('SELECT receivables_balance FROM customers WHERE organization_id = $1 AND id = $2', [f.orgId, f.client.id]);
    expect(Number(balanceAfter.rows[0].receivables_balance)).toBe(Number(balanceBefore.rows[0].receivables_balance));
    const queued = await db.query('SELECT id FROM outbox_emails WHERE organization_id = $1 AND invoice_id = $2', [f.orgId, invoice.id]);
    expect(queued.rows).toHaveLength(0);
    const attachments = await db.query('SELECT a.outbox_email_id FROM outbox_email_attachments a JOIN outbox_emails o ON o.id = a.outbox_email_id WHERE o.organization_id = $1 AND o.invoice_id = $2', [f.orgId, invoice.id]);
    expect(attachments.rows).toHaveLength(0);
    const audit = await db.query("SELECT id FROM audit_logs WHERE organization_id = $1 AND entity_id = $2 AND action = 'INVOICE_EMAIL_QUEUED'", [f.orgId, invoice.id]);
    expect(audit.rows).toHaveLength(0);
    const key = await db.query('SELECT id FROM api_idempotency_keys WHERE organization_id = $1 AND idempotency_key = $2', [f.orgId, 'invoice-email-audit-rollback-0001']);
    expect(key.rows).toHaveLength(0);
  });

  it('suppresses a queued reminder after a canonical full settlement', async () => {
    const f = await fixture('invoice-reminder-settled-suppression');
    const invoice = await SalesEngine.createAndPostInvoice(f.orgId, {
      customerId: f.client.id, customerName: 'Settled Customer', customerEmail: 'settled@example.com',
      issueDate: '2026-09-02', dueDate: '2026-09-15', lineItems: [{ description: 'Settlement item', quantity: 1, unitPrice: 90, taxRate: 0 }],
      status: 'DRAFT', createdBy: f.userId,
    } as any, f.userId);
    await SalesEngine.postInvoice(f.orgId, f.userId, invoice.id);
    const outboxId = await EmailOutboxService.enqueueEmail('settled@example.com', 'INVOICE_REMINDER', { invoiceNumber: invoice.invoiceNumber, customerName: 'Settled Customer', amountDue: 90, dueDate: '2026-09-15' }, f.orgId, { invoiceId: invoice.id, invoiceEmailKind: 'REMINDER' });
    await SalesEngine.recordPayment(f.orgId, { customerId: f.client.id, customerName: 'Settled Customer', invoiceId: invoice.id, paymentDate: '2026-09-24', amount: 90, depositToAccountId: f.paidFromAccountId, allocations: [{ invoiceId: invoice.id, amount: 90 }] }, f.userId);
    await db.query("UPDATE outbox_emails SET delivery_status = 'FAILED' WHERE id <> $1 AND delivery_status IN ('PENDING', 'RETRYING')", [outboxId]);
    const sender = vi.fn().mockResolvedValue({ success: true });
    EmailOutboxService.setCustomSender(sender);
    try {
      await EmailOutboxService.processOutbox(10);
      const row = await db.query('SELECT delivery_status FROM outbox_emails WHERE organization_id = $1 AND id = $2', [f.orgId, outboxId]);
      expect(row.rows[0].delivery_status).toBe('SUPPRESSED');
      expect(sender).not.toHaveBeenCalled();
    } finally { EmailOutboxService.setCustomSender(null); }
  });

  it('returns allocation amounts per invoice and the remaining unallocated amount', async () => {
    const f = await fixture('payment-allocation-evidence');
    const makeInvoice = async (name: string, amount: number) => {
      const created = await SalesEngine.createAndPostInvoice(f.orgId, {
        customerId: f.client.id, customerName: f.client.name, customerEmail: f.client.email,
        issueDate: '2026-09-02', dueDate: '2026-09-15', lineItems: [{ description: name, quantity: 1, unitPrice: amount, taxRate: 0 }],
        status: 'DRAFT', createdBy: f.userId,
      } as any, f.userId);
      await SalesEngine.postInvoice(f.orgId, f.userId, created.id);
      return created;
    };
    const first = await makeInvoice('First allocation', 40);
    const second = await makeInvoice('Second allocation', 60);
    const recorded = await SalesEngine.recordPayment(f.orgId, {
      customerId: f.client.id, customerName: f.client.name, paymentDate: '2026-09-24', amount: 130,
      depositToAccountId: f.paidFromAccountId,
      allocations: [{ invoiceId: first.id, amount: 40 }, { invoiceId: second.id, amount: 60 }],
    }, f.userId);
    const response = await request(app).get('/api/v1/finance/payments-received').set(f.auth);
    expect(response.status).toBe(200);
    const payment = response.body.find((row: any) => row.id === recorded.id);
    expect(payment.allocations).toEqual([
      { invoiceId: first.id, invoiceNumber: first.invoiceNumber, amount: 40 },
      { invoiceId: second.id, invoiceNumber: second.invoiceNumber, amount: 60 },
    ]);
    expect(payment.unallocatedAmount).toBe(30);
    expect(payment.invoiceNumber).toBe(first.invoiceNumber + ', ' + second.invoiceNumber);
  });

  it('preserves the unapplied remainder as reversal history while clearing the current balance', async () => {
    const f = await fixture('payment-reversal-allocation-evidence');
    const makeInvoice = async (name: string, amount: number) => {
      const created = await SalesEngine.createAndPostInvoice(f.orgId, {
        customerId: f.client.id, customerName: f.client.name, customerEmail: f.client.email,
        issueDate: '2026-09-02', dueDate: '2026-09-15', lineItems: [{ description: name, quantity: 1, unitPrice: amount, taxRate: 0 }],
        status: 'DRAFT', createdBy: f.userId,
      } as any, f.userId);
      await SalesEngine.postInvoice(f.orgId, f.userId, created.id);
      return created;
    };
    const first = await makeInvoice('Reversed first allocation', 40);
    const second = await makeInvoice('Reversed second allocation', 60);
    const recorded = await SalesEngine.recordPayment(f.orgId, {
      customerId: f.client.id, customerName: f.client.name, paymentDate: '2026-09-24', amount: 130,
      depositToAccountId: f.paidFromAccountId,
      allocations: [{ invoiceId: first.id, amount: 40 }, { invoiceId: second.id, amount: 60 }],
    }, f.userId);

    await FinancialDestructiveActionsService.reversePaymentReceived(f.orgId, recorded.id, f.userId, 'Duplicate receipt');
    const response = await request(app).get('/api/v1/finance/payments-received').set(f.auth);
    expect(response.status).toBe(200);
    const payment = response.body.find((row: any) => row.id === recorded.id);
    expect(payment.status).toBe('REVERSED');
    expect(payment.unallocatedAmount).toBe(0);
    expect(payment.unallocatedAmountBeforeReversal).toBe(30);
    expect(payment.allocations).toEqual([
      { invoiceId: first.id, invoiceNumber: first.invoiceNumber, amount: 40 },
      { invoiceId: second.id, invoiceNumber: second.invoiceNumber, amount: 60 },
    ]);
    const stored = await db.query('SELECT unallocated_amount, unallocated_amount_before_reversal FROM payments_received WHERE organization_id = $1 AND id = $2', [f.orgId, recorded.id]);
    expect(stored.rows[0]).toMatchObject({ unallocated_amount: 0, unallocated_amount_before_reversal: 30 });
  });

  it('2. sendInvoiceEmail rejects sending when an invoice is pending approval or voided', async () => {
    const f = await fixture('approval-email-gate');

    // Create an invoice in DRAFT status
    const invRes = await SalesEngine.createAndPostInvoice(f.orgId, {
      customerId: f.client.id,
      customerName: 'Client Customer',
      customerEmail: 'client@clientcorp.com',
      issueDate: '2026-09-02',
      dueDate: '2026-09-15',
      lineItems: [{ description: 'High value item', quantity: 1, unitPrice: 2000.0, taxRate: 0 }],
      status: 'DRAFT',
      createdBy: f.userId,
    } as any, f.userId);

    // Transition directly to SUBMITTED without journal entry (awaiting approval)
    await db.query(
      `UPDATE invoices SET status = 'SUBMITTED', journal_entry_id = NULL WHERE organization_id = $1 AND id = $2`,
      [f.orgId, invRes.id]
    );

    // Attempting to send-email on SUBMITTED must fail with 422
    const subRes = await request(app)
      .post(`/api/v1/finance/invoices/${invRes.id}/send-email`)
      .set(f.auth)
      .send({ recipientEmail: 'client@clientcorp.com' });

    expect(subRes.status).toBe(422);
    expect(subRes.body.error).toContain('awaiting approval');

    // Mark invoice VOIDED and verify rejection with 400
    await db.query(`UPDATE invoices SET status = 'VOIDED' WHERE organization_id = $1 AND id = $2`, [f.orgId, invRes.id]);
    const voidRes = await request(app)
      .post(`/api/v1/finance/invoices/${invRes.id}/send-email`)
      .set(f.auth)
      .send({ recipientEmail: 'client@clientcorp.com' });

    expect(voidRes.status).toBe(400);
    expect(voidRes.body.error).toContain('voided');
  });

  it('3. voidInvoice releases linked billable expenses back to unbilled with audit trail', async () => {
    const f = await fixture('void-release-expenses');

    // 1. Create a billable expense
    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        vendorName: 'Vendor Services',
        date: '2026-09-05',
        amount: 320.0,
        clientId: f.client.id,
        customerId: f.client.id,
        isBillable: true,
        description: 'Software license to reimburse',
      });
    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;

    // 2. Convert to posted customer invoice
    const convertRes = await request(app)
      .post(`/api/v1/finance/expenses/${expenseId}/convert-to-invoice`)
      .set(f.auth)
      .send({ issueDate: '2026-09-06', dueDate: '2026-09-20' });

    expect(convertRes.status).toBe(201);
    const invoiceId = convertRes.body.invoice.id;

    // Verify expense is billed
    const expBilled = await db.query(
      `SELECT is_billed, invoice_id FROM expenses WHERE organization_id = $1 AND id = $2`,
      [f.orgId, expenseId]
    );
    expect(expBilled.rows[0].is_billed).toBe(true);
    expect(expBilled.rows[0].invoice_id).toBe(invoiceId);

    // 3. Void the customer invoice
    const appendBatch = AuditTrailService.appendBatchInTransaction;
    let auditInsertCount = 0;
    const failSecondAuditInsert = vi.spyOn(AuditTrailService, 'appendBatchInTransaction').mockImplementationOnce(async (client, organizationId, entries, options) => {
      const faultingClient = {
        query: async (sql: string, params?: any[], queryOptions?: any) => {
          if (sql.includes('INSERT INTO audit_logs')) {
            auditInsertCount += 1;
            if (auditInsertCount === 2) throw new Error('Injected second audit insert failure');
          }
          return client.query(sql, params, queryOptions);
        },
      };
      return appendBatch(faultingClient, organizationId, entries, options);
    });
    await expect(FinancialDestructiveActionsService.voidInvoice(
      f.orgId, invoiceId, f.userId, 'Customer project cancelled by mutual agreement'
    )).rejects.toThrow('Injected second audit insert failure');
    failSecondAuditInsert.mockRestore();
    expect(auditInsertCount).toBe(2);
    const stateAfterAuditFailure = await db.query(
      `SELECT i.status, i.reversal_journal_id, e.is_billed, e.invoice_id
         FROM invoices i JOIN expenses e ON e.organization_id = i.organization_id AND e.id = $3
        WHERE i.organization_id = $1 AND i.id = $2`,
      [f.orgId, invoiceId, expenseId]
    );
    expect(stateAfterAuditFailure.rows[0]).toMatchObject({ status: 'POSTED', reversal_journal_id: null, is_billed: true, invoice_id: invoiceId });
    const auditAfterFailure = await db.query(
      `SELECT COUNT(*) AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Invoice' AND entity_id = $2
         AND action IN ('EXPENSES_RELEASED_FROM_VOIDED_INVOICE', 'INVOICE_VOIDED')`,
      [f.orgId, invoiceId]
    );
    expect(Number(auditAfterFailure.rows[0].count)).toBe(0);
    const voidResult = await FinancialDestructiveActionsService.voidInvoice(
      f.orgId, invoiceId, f.userId, 'Customer project cancelled by mutual agreement'
    );
    expect(voidResult.success).toBe(true);
    expect(voidResult.auditLogId).toBeTruthy();

    // 4. Verify the linked expense was released back to unbilled!
    const expReleased = await db.query(
      `SELECT is_billed, invoice_id, is_billable FROM expenses WHERE organization_id = $1 AND id = $2`,
      [f.orgId, expenseId]
    );
    expect(expReleased.rows[0].is_billed).toBe(false);
    expect(expReleased.rows[0].invoice_id).toBeNull();
    expect(expReleased.rows[0].is_billable).toBe(true);

    // 5. Verify audit log recorded EXPENSES_RELEASED_FROM_VOIDED_INVOICE
    const auditLogs = await db.query(
      `SELECT action, after_state FROM audit_logs
        WHERE organization_id = $1 AND entity_type = 'Invoice' AND entity_id = $2 AND action = 'EXPENSES_RELEASED_FROM_VOIDED_INVOICE'`,
      [f.orgId, invoiceId]
    );
    expect(auditLogs.rows.length).toBe(1);
    const chainedVoidEvents = await db.query(
      `SELECT action, timestamp, previous_hash, current_hash FROM audit_logs
        WHERE organization_id = $1 AND entity_type = 'Invoice' AND entity_id = $2
          AND action IN ('EXPENSES_RELEASED_FROM_VOIDED_INVOICE', 'INVOICE_VOIDED')
        ORDER BY timestamp ASC, id ASC`,
      [f.orgId, invoiceId]
    );
    expect(chainedVoidEvents.rows.map((row) => row.action)).toEqual(['EXPENSES_RELEASED_FROM_VOIDED_INVOICE', 'INVOICE_VOIDED']);
    expect(chainedVoidEvents.rows[0].current_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(chainedVoidEvents.rows[1].current_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(chainedVoidEvents.rows[1].previous_hash).toBe(chainedVoidEvents.rows[0].current_hash);
    expect(new Date(chainedVoidEvents.rows[1].timestamp).getTime()).toBeGreaterThan(new Date(chainedVoidEvents.rows[0].timestamp).getTime());

    // 6. Verify the released expense can now be converted to a NEW invoice!
    const reconvertRes = await request(app)
      .post(`/api/v1/finance/expenses/${expenseId}/convert-to-invoice`)
      .set(f.auth)
      .send({ issueDate: '2026-09-10', dueDate: '2026-09-25' });

    expect(reconvertRes.status).toBe(201);
    expect(reconvertRes.body.invoice.id).not.toBe(invoiceId);
  });

  it('4. voidExpense is rejected when the expense is linked to an active customer invoice', async () => {
    const f = await fixture('void-expense-guard');

    // 1. Create billable expense
    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        vendorName: 'Tool Rental Co',
        date: '2026-09-08',
        amount: 750.0,
        clientId: f.client.id,
        customerId: f.client.id,
        isBillable: true,
        description: 'Equipment rental',
      });
    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;

    // 2. Convert to posted customer invoice
    const convertRes = await request(app)
      .post(`/api/v1/finance/expenses/${expenseId}/convert-to-invoice`)
      .set(f.auth)
      .send({ issueDate: '2026-09-09', dueDate: '2026-09-23' });
    expect(convertRes.status).toBe(201);
    const invoiceId = convertRes.body.invoice.id;

    // 3. Attempting to void the billed expense directly must fail!
    await expect(
      FinancialDestructiveActionsService.voidExpense(
        f.orgId,
        expenseId,
        f.userId,
        'Attempting to void billed expense'
      )
    ).rejects.toThrow(/EXPENSE_ALREADY_BILLED/);

    // Verify expense is still valid and not voided
    const expCheck = await db.query(
      `SELECT status, is_billed FROM expenses WHERE organization_id = $1 AND id = $2`,
      [f.orgId, expenseId]
    );
    expect(expCheck.rows[0].status).not.toBe('VOIDED');
    expect(expCheck.rows[0].is_billed).toBe(true);

    // 4. Void the invoice first
    await FinancialDestructiveActionsService.voidInvoice(
      f.orgId,
      invoiceId,
      f.userId,
      'Voiding invoice to free expense'
    );

    // 5. Now voiding the released expense must succeed!
    const voidExpResult = await FinancialDestructiveActionsService.voidExpense(
      f.orgId,
      expenseId,
      f.userId,
      'Now voiding released expense'
    );
    expect(voidExpResult.success).toBe(true);

    const expFinal = await db.query(
      `SELECT status, reversal_journal_id FROM expenses WHERE organization_id = $1 AND id = $2`,
      [f.orgId, expenseId]
    );
    expect(expFinal.rows[0].status).toBe('VOIDED');
    expect(expFinal.rows[0].reversal_journal_id).toBeTruthy();
  });

  it('5. runRecoverableCostPreflightAudit detects unposted invoices and orphaned states non-destructively', async () => {
    const f = await fixture('preflight-audit');

    // Clean initial state
    const initialAudit = await AccountingIntegrityService.runRecoverableCostPreflightAudit(f.orgId);
    expect(initialAudit.isClean).toBe(true);
    expect(initialAudit.unpostedInvoiceCount).toBe(0);
    expect(initialAudit.orphanedBilledExpenseCount).toBe(0);
    expect(initialAudit.expensesLinkedToVoidInvoicesCount).toBe(0);

    // Inject a simulated legacy uncertified posted invoice (POSTED without journal_entry_id)
    const testInvId = `inv-corrupt-${Date.now()}`;
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_name, total_amount, balance_due, status, issue_date, due_date)
       VALUES ($1, $2, $3, 'Legacy Customer', 1200, 1200, 'POSTED', '2026-01-01', '2026-01-15')`,
      [testInvId, f.orgId, `INV-LEGACY-001`]
    );

    // Inject an orphaned billed expense (is_billed = TRUE without invoice_id)
    const testExpId = `exp-corrupt-${Date.now()}`;
    await db.query(
      `INSERT INTO expenses (id, organization_id, expense_number, expense_account_id, paid_from_account_id, amount, date, is_billed, is_billable, status)
       VALUES ($1, $2, $3, $4, $5, 400, '2026-01-01', TRUE, TRUE, 'POSTED')`,
      [testExpId, f.orgId, `EXP-LEGACY-001`, f.expenseAccountId, f.paidFromAccountId]
    );

    // Run audit and verify detections
    const auditReport = await AccountingIntegrityService.runRecoverableCostPreflightAudit(f.orgId);
    expect(auditReport.isClean).toBe(false);
    expect(auditReport.unpostedInvoiceCount).toBe(1);
    expect(auditReport.unpostedInvoices[0].invoiceNumber).toBe('INV-LEGACY-001');
    expect(auditReport.orphanedBilledExpenseCount).toBe(1);
    expect(auditReport.orphanedBilledExpenses[0].expenseNumber).toBe('EXP-LEGACY-001');

    // Clean up test anomalies so tenant is left clean
    await db.query(`DELETE FROM invoices WHERE organization_id = $1 AND id = $2`, [f.orgId, testInvId]);
    await db.query(`DELETE FROM expenses WHERE organization_id = $1 AND id = $2`, [f.orgId, testExpId]);

    const finalAudit = await AccountingIntegrityService.runRecoverableCostPreflightAudit(f.orgId);
    expect(finalAudit.isClean).toBe(true);
  });
});
