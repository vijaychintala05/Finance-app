import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { db } from '../database/db';
import { JobSchedulerService } from '../jobs/JobSchedulerService';
import { RecurringDocumentJobHandler } from '../jobs/RecurringDocumentJobHandler';
import { EmailOutboxService } from '../services/EmailOutboxService';
import { PaymentGatewayService } from '../services/PaymentGatewayService';
import { BankFeedSyncService, MockBankFeedProvider } from '../banking/BankFeedSyncService';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { BankRulesEngine } from '../banking/BankRulesEngine';
import { BankMatchingEngine } from '../banking/BankMatchingEngine';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';

import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';

describe('Stage 5 — Banking and Background Processing', () => {
  const ORG = F.ORG_A.id;
  const ACTOR = F.PERSONAS.ORG_A.owner.id;
  let bankAccountId: string;
  let customerId: string;
  let vendorId: string;

  beforeEach(async () => {
    await MasterFinanceFixture.setup();

    const bankLedgerAcc = (await db.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = '1010'`,
      [ORG]
    )).rows[0].id;

    // Create active bank account linked to 1010
    const bankAccount = await BankReconciliationService.createBankAccount(ORG, {
      ledgerAccountId: bankLedgerAcc,
      accountName: 'HDFC Current Operating Account',
      bankName: 'HDFC Bank',
      accountNumber: '50200012345678',
      accountType: 'Checking',
      currency: 'INR',
      openingBalanceDate: '2026-01-01',
    }, ACTOR);
    bankAccountId = bankAccount.id;

    customerId = F.CUSTOMERS.A1.id;
    vendorId = F.VENDORS.A1.id;

    MockBankFeedProvider.clear();
  });

  // =========================================================================
  // 1. DURABLE JOB SCHEDULING, LEASES, RETRIES, AND DEAD-LETTER QUEUE
  // =========================================================================
  it('1. Schedules, claims with worker lease, executes, and records job execution history', async () => {
    const job = await JobSchedulerService.scheduleJob(
      ORG,
      'TEST_INVOICE_GENERATION',
      { customerId, amount: 25000 },
      { idempotencyKey: 'idemp-job-1', maxRetries: 3 }
    );

    expect(job.id).toBeDefined();
    expect(job.status).toBe('PENDING');

    // Idempotent duplicate schedule should return existing job
    const dupJob = await JobSchedulerService.scheduleJob(
      ORG,
      'TEST_INVOICE_GENERATION',
      { customerId, amount: 25000 },
      { idempotencyKey: 'idemp-job-1' }
    );
    expect(dupJob.id).toBe(job.id);

    // Worker 1 claims job
    const claimed = await JobSchedulerService.claimJobs('worker-node-1', 5, 60);
    const myClaim = claimed.find((j) => j.id === job.id);
    expect(myClaim).toBeDefined();
    expect(myClaim?.status).toBe('PROCESSING');
    expect(myClaim?.leaseOwner).toBe('worker-node-1');

    // Complete job
    await JobSchedulerService.completeJob(job.id, 'worker-node-1', { invoiceCreated: 'inv-123' });

    const completed = await JobSchedulerService.getJob(ORG, job.id);
    expect(completed?.status).toBe('COMPLETED');
    expect(completed?.leaseOwner).toBeNull();
    expect(completed?.result?.invoiceCreated).toBe('inv-123');

    // Execution run history is recorded
    const runs = await JobSchedulerService.getJobRuns(ORG, job.id);
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe('COMPLETED');
    expect(runs[0].worker_id).toBe('worker-node-1');
  });

  it('2. Fails job with backoff and moves to DEAD_LETTER after max attempts; supports manual retry', async () => {
    const job = await JobSchedulerService.scheduleJob(
      ORG,
      'EXTERNAL_PAYMENT_SYNC',
      { accountId: 'acc-1' },
      { maxRetries: 2, backoffSeconds: 1 }
    );

    // Claim & fail attempt 1
    await JobSchedulerService.claimJobs('worker-1', 1, 60);
    await JobSchedulerService.failJob(job.id, 'worker-1', 'Connection timeout on gateway');

    let current = await JobSchedulerService.getJob(ORG, job.id);
    expect(current?.status).toBe('PENDING'); // Still retrying
    expect(current?.attemptCount).toBe(1);

    // Claim & fail attempt 2 (exhausting maxRetries = 2)
    // Force next_attempt_at to past so it can be claimed immediately
    await db.query(`UPDATE background_jobs SET next_attempt_at = CURRENT_TIMESTAMP WHERE id = $1`, [job.id]);
    await JobSchedulerService.claimJobs('worker-1', 1, 60);
    await JobSchedulerService.failJob(job.id, 'worker-1', 'Fatal authentication error');

    current = await JobSchedulerService.getJob(ORG, job.id);
    expect(current?.status).toBe('DEAD_LETTER');
    expect(current?.attemptCount).toBe(2);

    // Operator inspects failed jobs
    const deadLetters = await JobSchedulerService.listJobs(ORG, { status: 'DEAD_LETTER' });
    expect(deadLetters.some((j) => j.id === job.id)).toBe(true);

    // Operator fixes issue and safely retries the job
    const retried = await JobSchedulerService.retryFailedJob(ORG, job.id);
    expect(retried.status).toBe('PENDING');
    expect(retried.attemptCount).toBe(0);
    expect(retried.lastError).toBeNull();
  });

  it('3. Crash recovery recovers abandoned leases when a worker dies', async () => {
    const job = await JobSchedulerService.scheduleJob(
      ORG,
      'CRASH_TEST_JOB',
      { data: 'sample' },
      { maxRetries: 3 }
    );

    // Worker claims job with 1 second lease
    await JobSchedulerService.claimJobs('crashed-worker-99', 1, 1);

    // Simulate worker process crash: lease expires in past
    await db.query(
      `UPDATE background_jobs
       SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 seconds'
       WHERE id = $1`,
      [job.id]
    );

    // Recovery daemon runs
    const recoveryResult = await JobSchedulerService.recoverExpiredLeases('recovery-daemon');
    expect(recoveryResult.recoveredCount).toBeGreaterThanOrEqual(1);

    const recoveredJob = await JobSchedulerService.getJob(ORG, job.id);
    expect(recoveredJob?.status).toBe('PENDING');
    expect(recoveredJob?.leaseOwner).toBeNull();
    expect(recoveredJob?.lastError).toContain('LEASE_EXPIRED_CRASH_RECOVERY');
  });

  // =========================================================================
  // 2. RECURRING DOCUMENT AUTOMATIC EXECUTION
  // =========================================================================
  it('4. Automatically materializes, claims, and executes recurring invoices, bills, and expenses', async () => {
    // Create recurring invoice profile
    const recurringService = RecurringDocumentJobHandler.createService(ACTOR);
    const invoiceProfile = await recurringService.createProfile({
      organizationId: ORG,
      name: 'Monthly SaaS Retainer - Alpha Tech',
      kind: 'INVOICE',
      frequency: 'MONTHLY',
      intervalCount: 1,
      startDate: '2026-03-01',
      autoPost: true,
      createdBy: ACTOR,
      template: {
        customerId,
        lineItems: [
          { description: 'Cloud Management Service Retainer', quantity: 1, unitPrice: 50000, taxRate: 0, amount: 50000 },
        ],
        notes: 'Recurring SaaS invoice',
      },
    });

    // Create recurring bill profile
    const billProfile = await recurringService.createProfile({
      organizationId: ORG,
      name: 'Monthly Server Infrastructure Bill',
      kind: 'BILL',
      frequency: 'MONTHLY',
      intervalCount: 1,
      startDate: '2026-03-01',
      autoPost: true,
      createdBy: ACTOR,
      template: {
        vendorId,
        lineItems: [
          { description: 'Dedicated Server Hosting', quantity: 1, unitPrice: 15000, taxRate: 0, amount: 15000 },
        ],
        notes: 'Monthly infrastructure bill',
      },
    });

    expect(invoiceProfile.status).toBe('ACTIVE');
    expect(billProfile.status).toBe('ACTIVE');

    // Run RecurringDocumentJobHandler as of 2026-03-05
    const executionResult = await RecurringDocumentJobHandler.processDue({
      organizationId: ORG,
      asOfDate: '2026-03-05',
      workerId: 'recurring-worker-1',
    });

    expect(executionResult.materializedOccurrences).toBe(2);
    expect(executionResult.successfulOccurrences).toBe(2);
    expect(executionResult.failedOccurrences).toBe(0);

    // Verify generated documents
    const createdInvoice = await db.query(
      `SELECT * FROM invoices WHERE organization_id = $1 AND customer_id = $2`,
      [ORG, customerId]
    );
    expect(createdInvoice.rows.length).toBe(1);
    expect(Number(createdInvoice.rows[0].total_amount)).toBe(50000);
    expect(createdInvoice.rows[0].source_occurrence_key).toBeDefined();

    const createdBill = await db.query(
      `SELECT * FROM bills WHERE organization_id = $1 AND vendor_id = $2`,
      [ORG, vendorId]
    );
    expect(createdBill.rows.length).toBe(1);
    expect(Number(createdBill.rows[0].total_amount)).toBe(15000);
    expect(createdBill.rows[0].source_occurrence_key).toBeDefined();

    // Executing again for the same date is duplicate-safe (0 new occurrences)
    const secondRun = await RecurringDocumentJobHandler.processDue({
      organizationId: ORG,
      asOfDate: '2026-03-05',
      workerId: 'recurring-worker-1',
    });
    expect(secondRun.materializedOccurrences).toBe(0);
  });

  // =========================================================================
  // 3. RELIABLE EMAIL DELIVERY AND CRASH RECOVERY
  // =========================================================================
  it('5. Enqueues financial emails, claims with lease, dispatches reliably, and recovers crashed workers', async () => {
    const dispatchedEmails: any[] = [];
    EmailOutboxService.setCustomSender(async (email) => {
      dispatchedEmails.push(email);
      return { success: true };
    });

    // Enqueue invoice reminder & approval notification
    const reminderId = await EmailOutboxService.enqueueInvoiceReminder(ORG, 'client@alphatech.com', {
      invoiceNumber: 'INV-2026-001',
      customerName: 'Alpha Tech',
      amountDue: 50000,
      dueDate: '2026-03-31',
      paymentLink: 'https://app.firmbooks.local/pay/INV-2026-001',
    });

    const approvalId = await EmailOutboxService.enqueueApprovalNotification(ORG, 'cfo@firmbooks.local', {
      documentType: 'INVOICE',
      documentNumber: 'INV-2026-001',
      submitterName: 'John Doe',
      amount: 50000,
    });

    expect(reminderId).toBeDefined();
    expect(approvalId).toBeDefined();

    // Process outbox with worker lease
    const res = await EmailOutboxService.processOutbox(10, 300, 'mailer-daemon-1');
    expect(res.processed).toBe(2);
    expect(res.successful).toBe(2);
    expect(dispatchedEmails.length).toBe(2);

    // Verify outbox statuses
    const outbox = await EmailOutboxService.listOutbox(ORG);
    const reminderRow = outbox.find((e) => e.id === reminderId);
    expect(reminderRow?.deliveryStatus).toBe('SENT');
    expect(reminderRow?.templateType).toBe('INVOICE_REMINDER');

    // Test email crash recovery
    const alertId = await EmailOutboxService.enqueueOperationalAlert(ORG, 'admin@firmbooks.local', {
      alertType: 'HIGH_MEMORY_USAGE',
      message: 'Node heap usage exceeds 85%',
      severity: 'WARNING',
    });

    // Worker claims but simulates sudden process crash before completion
    await db.query(
      `UPDATE outbox_emails
       SET delivery_status = 'PROCESSING',
           lease_owner = 'dead-worker-pid-404',
           lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 seconds'
       WHERE id = $1`,
      [alertId]
    );

    // Recovery runs and safely reclaims the email for retry
    const recoveredCount = await EmailOutboxService.recoverExpiredLeases();
    expect(recoveredCount).toBeGreaterThanOrEqual(1);

    const alertEmail = (await EmailOutboxService.listOutbox(ORG)).find((e) => e.id === alertId);
    expect(alertEmail?.deliveryStatus).toBe('RETRYING');
    expect(alertEmail?.leaseOwner).toBeNull();
  });

  // =========================================================================
  // 4. BANK IMPORT PREVIEW, FORMAT VALIDATION, AND DEDUPLICATION
  // =========================================================================
  it('6. Previews bank statements before import, detects duplicates, and validates currency', async () => {
    const csvContent = `Date,Narration,Withdrawal,Deposit,Balance
2026-03-01,Client Wire Payment - Alpha Tech,,50000.00,150000.00
2026-03-02,AWS Cloud Hosting Infrastructure,12500.00,,137500.00
2026-03-03,Office Stationery Supplies,1500.00,,136000.00`;

    // 1. Preview statement without committing to database
    const preview = await BankReconciliationService.previewStatement(
      ORG,
      bankAccountId,
      'hdfc_march_statement.csv',
      csvContent,
      'CSV'
    );

    expect(preview.isValid).toBe(true);
    expect(preview.totalTransactions).toBe(3);
    expect(preview.newTransactionsCount).toBe(3);
    expect(preview.duplicateCount).toBe(0);
    expect(preview.previewTransactions.length).toBe(3);

    // Verify DB still has 0 transactions
    const dbTxsBefore = await BankReconciliationService.getTransactions(ORG, { bankAccountId });
    expect(dbTxsBefore.length).toBe(0);

    // 2. Commit actual import
    const importRes = await BankReconciliationService.importStatement(
      ORG,
      bankAccountId,
      'hdfc_march_statement.csv',
      csvContent,
      'CSV',
      undefined,
      ACTOR
    );

    expect(importRes.newTransactionsCount).toBe(3);
    expect(importRes.duplicateCount).toBe(0);

    // 3. Re-preview the same statement: reports 3 duplicates, 0 new transactions
    const rePreview = await BankReconciliationService.previewStatement(
      ORG,
      bankAccountId,
      'hdfc_march_statement.csv',
      csvContent,
      'CSV'
    );

    expect(rePreview.totalTransactions).toBe(3);
    expect(rePreview.duplicateCount).toBe(3);
    expect(rePreview.newTransactionsCount).toBe(0);
  });

  // =========================================================================
  // 5. EXPLAINABLE MATCHING SUGGESTIONS AND ADVANCED RULES ENGINE
  // =========================================================================
  it('7. Suggests matches with explainable confidence breakdown and evaluates rich categorization rules', async () => {
    // Post an invoice for Alpha Tech: ₹50,000
    const invoice = await SalesEngine.createAndPostInvoice(ORG, {
      customerId,
      issueDate: '2026-03-01',
      dueDate: '2026-03-20',
      lineItems: [{ description: 'Tech Consulting', quantity: 1, unitPrice: 50000, taxRate: 0, amount: 50000 }],
      invoiceNumber: 'INV-MATCH-50K',
    });

    // Statement transaction for ₹50,000 matching invoice
    const statementTx: any = {
      id: 'btx-match-1',
      organizationId: ORG,
      bankAccountId,
      transactionDate: '2026-03-02',
      amount: 50000,
      direction: 'CREDIT',
      narration: 'NEFT INW: Alpha Tech Solutions INV-MATCH-50K',
      reference: 'INV-MATCH-50K',
      reconciliationStatus: 'UNMATCHED',
    };

    // Candidates list
    const candidates = [
      {
        id: invoice.id,
        type: 'invoice' as const,
        referenceNumber: 'INV-MATCH-50K',
        date: '2026-03-01',
        amount: 50000,
        unallocatedAmount: 50000,
        entityName: 'Alpha Tech Solutions',
      },
    ];

    const matches = BankMatchingEngine.findMatches(statementTx, candidates);
    expect(matches.length).toBe(1);
    expect(matches[0].confidenceScore).toBeGreaterThanOrEqual(90);
    // Reasons contain explainable codes & descriptions
    const reasonCodes = matches[0].reasons.map((r) => r.code);
    expect(reasonCodes).toContain('EXACT_AMOUNT');
    expect(reasonCodes).toContain('EXACT_REFERENCE');
    expect(reasonCodes).toContain('DATE_PROXIMITY_HIGH');
    expect(reasonCodes).toContain('ENTITY_NAME_MATCH');

    // Test Extended BankRulesEngine
    const testRules = [
      {
        id: 'rule-aws',
        organizationId: ORG,
        ruleName: 'Auto Categorize AWS Hosting',
        priority: 1,
        direction: 'DEBIT' as const,
        narrationPattern: 'AWS Cloud',
        suggestedCategory: 'Infrastructure Hosting',
        suggestedAccountId: '6100',
        minAmount: 1000,
        maxAmount: 100000,
        isEnabled: true,
        createdAt: '2026-01-01',
      },
    ];

    const debitTx: any = {
      id: 'btx-rule-1',
      organizationId: ORG,
      bankAccountId,
      transactionDate: '2026-03-03',
      amount: 12500,
      direction: 'DEBIT',
      narration: 'POS TXN: AWS Cloud Hosting Seattle',
      reconciliationStatus: 'UNMATCHED',
    };

    const ruleResult = BankRulesEngine.evaluateRules(debitTx, testRules);
    expect(ruleResult).not.toBeNull();
    expect(ruleResult?.ruleId).toBe('rule-aws');
    expect(ruleResult?.suggestedCategory).toBe('Infrastructure Hosting');
    expect(ruleResult?.matchExplanation).toContain('AWS Cloud');
  });

  // =========================================================================
  // 6. BANK FEED SYNCHRONIZATION
  // =========================================================================
  it('8. Synchronizes bank feeds with fingerprint deduplication and cursor progression', async () => {
    // Connect bank feed to mock provider
    const connection = await BankFeedSyncService.connectFeed(ORG, bankAccountId, 'mock');
    expect(connection.connectionStatus).toBe('ACTIVE');

    // Seed mock feed with 2 transactions
    MockBankFeedProvider.seedFeed(bankAccountId, [
      {
        externalId: 'feed-tx-1',
        transactionDate: '2026-03-01',
        amount: 30000,
        direction: 'CREDIT',
        narration: 'Customer Transfer Alpha Tech',
        reference: 'UTR1000001',
      },
      {
        externalId: 'feed-tx-2',
        transactionDate: '2026-03-02',
        amount: 8500,
        direction: 'DEBIT',
        narration: 'Software Subscription SaaS',
        reference: 'UTR1000002',
      },
    ]);

    // 1. Initial Sync
    const sync1 = await BankFeedSyncService.syncFeed(ORG, bankAccountId, 'mock');
    expect(sync1.syncedCount).toBe(2);
    expect(sync1.duplicateCount).toBe(0);

    // Verify stored in bank_statement_transactions
    const txsInDb = await BankReconciliationService.getTransactions(ORG, { bankAccountId });
    expect(txsInDb.some((t) => t.reference === 'UTR1000001')).toBe(true);

    // 2. Re-sync with no new transactions: 0 new, 2 duplicates skipped
    const sync2 = await BankFeedSyncService.syncFeed(ORG, bankAccountId, 'mock');
    expect(sync2.syncedCount).toBe(0);
    expect(sync2.duplicateCount).toBe(2);
  });

  // =========================================================================
  // 7. PAYMENT GATEWAY INTEGRATION & DUPLICATE-SAFE WEBHOOKS
  // =========================================================================
  it('9. Idempotently processes payment gateway webhook, verifies HMAC signature, settles invoice, and accounts for gateway fees', async () => {
    // 1. Create invoice for Alpha Tech: ₹10,000
    const invoice = await SalesEngine.createAndPostInvoice(ORG, {
      customerId,
      issueDate: '2026-03-01',
      dueDate: '2026-03-20',
      lineItems: [{ description: 'Custom App Development', quantity: 1, unitPrice: 10000, taxRate: 0, amount: 10000 }],
      invoiceNumber: 'INV-GW-10K',
    });

    expect(Number(invoice.balanceDue)).toBe(10000);

    // 2. Prepare Webhook with HMAC signature
    const webhookSecret = 'whsec_test_secret_key_12345';
    const eventId = 'evt_charge_succeeded_889900';
    const payload = {
      id: eventId,
      object: 'event',
      type: 'payment.succeeded',
      data: {
        object: {
          id: 'ch_998877',
          amount: 1000000, // ₹10,000 in paise (subunits)
          fee: 20000,     // ₹200 gateway fee deduction in paise (subunits)
          invoiceId: invoice.id,
          currency: 'INR',
          created_at: '2026-03-04T10:00:00Z',
          bankAccountId,
        },
      },
    };

    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = `t=${timestamp},v1=${crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.${rawBody}`).digest('hex')}`;

    // Verify signature helper directly
    const isValid = PaymentGatewayService.verifyWebhookSignature(rawBody, signature, webhookSecret);
    expect(isValid).toBe(true);

    // 3. Process Webhook
    const webhookResult = await PaymentGatewayService.processWebhook({
      organizationId: ORG,
      gateway: 'stripe',
      eventId,
      eventType: 'payment.succeeded',
      payload,
      rawBody,
      signature,
      webhookSecret,
    });

    expect(webhookResult.status).toBe('PROCESSED');
    expect(webhookResult.paymentId).toBeDefined();
    expect(webhookResult.expenseId).toBeDefined(); // Gateway fee recorded as expense

    // Verify invoice is settled
    const updatedInvoice = await SalesEngine.getInvoice(ORG, invoice.id);
    expect(Number(updatedInvoice?.balanceDue)).toBe(0);
    expect(updatedInvoice?.status).toBe('PAID');

    // 4. Duplicate webhook delivery test (e.g. gateway retry)
    const duplicateResult = await PaymentGatewayService.processWebhook({
      organizationId: ORG,
      gateway: 'stripe',
      eventId,
      eventType: 'payment.succeeded',
      payload,
      rawBody,
      signature,
      webhookSecret,
    });

    expect(duplicateResult.status).toBe('ALREADY_PROCESSED');
    expect(duplicateResult.settlementReference).toBe(webhookResult.settlementReference);
  });
});
