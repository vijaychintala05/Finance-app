import { describe, it, expect, beforeAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { JwtAuth } from '../auth/jwt';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { DataMigrationService } from '../services/DataMigrationService';
import { PaymentGatewayService } from '../services/PaymentGatewayService';
import { AuditTrailService } from '../security/AuditTrailService';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { MonetaryAccountPolicy } from '../accounting/monetaryAccountPolicy';
import financeRoutes from '../routes/finance.routes';
import { authMiddleware, organizationIsolationMiddleware } from '../middleware/organizationIsolation.middleware';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';

describe('Release Audit Qualification Certification Suite', () => {
  let app: Express;
  let orgId: string;
  let ownerToken: string;
  let viewerToken: string;
  let accountantToken: string;
  let ownerUserId: string;
  let viewerUserId: string;
  let accountantUserId: string;

  beforeAll(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });
    orgId = MASTER_FIXTURE_CONSTANTS.ORG_A.id;

    ownerUserId = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.owner.id;
    viewerUserId = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.viewer.id;
    accountantUserId = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.id;

    ownerToken = JwtAuth.generateToken({
      userId: ownerUserId,
      email: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.owner.email,
    });

    viewerToken = JwtAuth.generateToken({
      userId: viewerUserId,
      email: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.viewer.email,
    });

    accountantToken = JwtAuth.generateToken({
      userId: accountantUserId,
      email: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.email,
    });

    app = express();
    app.use(express.json());
    app.use(authMiddleware);
    app.use(organizationIsolationMiddleware);
    app.use(idempotencyMiddleware);
    app.use('/api/v1/finance', financeRoutes);
  });

  describe('P0-04: Bank Categorization Period Lock Enforcement', () => {
    it('strictly rejects categorizing a bank statement transaction into a locked accounting period', async () => {
      // 1. Lock period up to 2025-01-31
      await db.query(
        `INSERT INTO period_locks (id, organization_id, lock_date, status, reason)
         VALUES ($1, $2, '2025-01-31', 'Active', 'Jan 2025 Closed')`,
        [newId('per'), orgId]
      );

      // 2. Ensure bank account profile exists
      const bankAccountId = newId('bnk');
      await db.query(
        `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, currency, is_active)
         VALUES ($1, $2, $3, 'HDFC Bank Profile', '1234567890', 'HDFC Bank', 'INR', TRUE)`,
        [bankAccountId, orgId, `acc-${orgId}-1010`]
      );

      // 3. Create statement import and insert statement transaction in the locked period (2025-01-15)
      const importId = newId('imp');
      await db.query(
        `INSERT INTO bank_statement_imports (id, organization_id, bank_account_id, original_filename, file_hash, parser_version, source_format, currency, status)
         VALUES ($1, $2, $3, 'stmt.csv', 'hash1', '1.0', 'CSV', 'INR', 'COMPLETED')`,
        [importId, orgId, bankAccountId]
      );

      const stTxId = newId('sttx-locked');
      await db.query(
        `INSERT INTO bank_statement_transactions (
           id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, currency, narration, fingerprint, reconciliation_status
         ) VALUES ($1, $2, $3, $4, '2025-01-15', 500.00, 'DEBIT', 'INR', 'Expense during locked period', 'fp-sttx-locked-01', 'UNRECONCILED')`,
        [stTxId, orgId, bankAccountId, importId]
      );

      // 4. Attempt to categorize into locked period
      await expect(
        BankReconciliationService.categorizeTransaction(
          orgId,
          stTxId,
          {
            ledgerAccountId: `acc-${orgId}-6000`,
            notes: 'Office supplies',
          },
          accountantUserId
        )
      ).rejects.toThrow(/locked/i);
    });
  });

  describe('P0-05: Opening Balance Control Account Protection', () => {
    it('strictly rejects direct opening balance migration to control accounts and creates zero journals', async () => {
      const invalidOpeningLines = [
        { accountId: `acc-${orgId}-1100`, accountCode: '1100', debit: 5000, credit: 0 },
        { accountId: `acc-${orgId}-3000`, accountCode: '3000', debit: 0, credit: 5000 },
      ];

      // Preview must reject
      const preview = await DataMigrationService.previewOpeningBalances(orgId, invalidOpeningLines);
      expect(preview.errors.length).toBeGreaterThan(0);
      expect(preview.errors[0].error).toMatch(/MIGRATION_CONTROL_ACCOUNT_REJECTED/);

      // Post must reject
      const countBefore = (
        await db.query(`SELECT COUNT(*) as count FROM journal_entries WHERE organization_id = $1`, [orgId])
      ).rows[0].count;

      await expect(
        DataMigrationService.postOpeningBalances(
          orgId,
          {
            asOfDate: '2026-04-01',
            lines: invalidOpeningLines,
          },
          ownerUserId
        )
      ).rejects.toThrow(/MIGRATION_CONTROL_ACCOUNT_REJECTED|MIGRATION_VALIDATION_FAILED/);

      // Prove NO journal entries were created after rejection
      const countAfter = (
        await db.query(`SELECT COUNT(*) as count FROM journal_entries WHERE organization_id = $1`, [orgId])
      ).rows[0].count;
      expect(Number(countAfter)).toBe(Number(countBefore));
    });
  });

  describe('P0-08 Part B: Payment Gateway Currency Verification', () => {
    it('strictly rejects a foreign-currency gateway receipt attempting to settle an INR invoice', async () => {
      const invId = newId('inv-cur-test');
      const custId = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id;

      await db.query(
        `INSERT INTO invoices (
           id, organization_id, invoice_number, client_id, customer_id, client_name,
           issue_date, due_date, subtotal, total_amount, paid_amount, balance_due, status
         ) VALUES ($1, $2, 'INV-CUR-001', $3, $3, 'Domestic Customer',
                   '2026-03-01', '2026-03-15', 1000.00, 1000.00, 0.00, 1000.00, 'POSTED')`,
        [invId, orgId, custId]
      );

      const intentId = newId('pi-cur-test');
      const providerRef = 'mock_ch_cur_1';
      await db.query(
        `INSERT INTO payment_intents (
           id, organization_id, customer_id, invoice_id, gateway, provider_session_id, provider_reference,
           currency, amount, status, idempotency_key, expires_at
         ) VALUES ($1, $2, $3, $4, 'mock', 'mock_sess_cur_1', $5, 'INR', 1000.00, 'CREATED', 'idem_cur_1', CURRENT_TIMESTAMP + INTERVAL '1 day')`,
        [intentId, orgId, custId, invId, providerRef]
      );

      const webhookPayload = {
        organizationId: orgId,
        gateway: 'mock',
        eventId: newId('evt-cur-mismatch'),
        eventType: 'payment.succeeded',
        payload: {
          id: providerRef,
          amount: 1000.00,
          currency: 'USD',
          invoiceId: invId,
        },
      };

      const result = await PaymentGatewayService.processWebhook(webhookPayload);
      expect(result.status).toBe('FAILED');
      expect(result.error).toMatch(/GATEWAY_CURRENCY_MISMATCH/);

      const inv = await db.query(`SELECT status, balance_due, paid_amount FROM invoices WHERE id = $1`, [invId]);
      expect(Number(inv.rows[0].paid_amount)).toBe(0);
      expect(inv.rows[0].status).toBe('POSTED');
    });
  });

  describe('P0-09: Budget RBAC and Segregation of Duties', () => {
    it('strictly rejects Viewer from creating a budget (403 Forbidden)', async () => {
      const budgetPayload = {
        name: 'Q3 IT Budget',
        financialYear: '2026-27',
        lines: [
          { accountId: `acc-${orgId}-6000`, periodKey: '2026-04', amount: 25000 },
        ],
      };

      const res = await request(app)
        .post('/api/v1/finance/budgets')
        .set('Authorization', `Bearer ${viewerToken}`)
        .set('x-organization-id', orgId)
        .send(budgetPayload);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/i);
    });

    it('allows Accountant/Owner to create a budget', async () => {
      const budgetPayload = {
        name: 'Q4 Marketing Budget',
        financialYear: '2026-27',
        lines: [
          { accountId: `acc-${orgId}-6000`, periodKey: '2026-05', amount: 40000 },
        ],
      };

      const res = await request(app)
        .post('/api/v1/finance/budgets')
        .set('Authorization', `Bearer ${accountantToken}`)
        .set('x-organization-id', orgId)
        .send(budgetPayload);

      expect([200, 201]).toContain(res.status);
    });
  });

  describe('P1-05: Audit Hash Chain Integrity', () => {
    it('detects unhashed corrupted rows during verifyHashChain', async () => {
      await AuditTrailService.logAction({
        organizationId: orgId,
        userId: ownerUserId,
        action: 'TEST_HASH_INIT',
        entityType: 'TestEntity',
        entityId: 'test-1',
      });

      await db.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, timestamp, current_hash)
         VALUES ($1, $2, $3, 'TAMPERED_ACTION', 'TestEntity', 'test-2', CURRENT_TIMESTAMP, NULL)`,
        [newId('aud'), orgId, ownerUserId]
      );

      const verification = await AuditTrailService.verifyHashChain(orgId);
      expect(verification.isValid).toBe(false);
      expect(verification.brokenAtLogId).toBeDefined();
    });
  });

  describe('P1-06: Idempotency Cross-User Replay Protection', () => {
    it('rejects an idempotent replay when attempted by a different user', async () => {
      const idempotencyKey = 'idem-key-user-isolation-test-12345';
      const budgetPayload = {
        name: 'Replay Test Budget',
        financialYear: '2026-27',
        lines: [
          { accountId: `acc-${orgId}-6000`, periodKey: '2026-06', amount: 30000 },
        ],
      };

      // 1. Accountant creates the resource
      const initialRes = await request(app)
        .post('/api/v1/finance/budgets')
        .set('Authorization', `Bearer ${accountantToken}`)
        .set('x-organization-id', orgId)
        .set('idempotency-key', idempotencyKey)
        .send(budgetPayload);

      expect([200, 201]).toContain(initialRes.status);

      // 2. Owner attempts to replay the same idempotency key
      const replayRes = await request(app)
        .post('/api/v1/finance/budgets')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-organization-id', orgId)
        .set('idempotency-key', idempotencyKey)
        .send(budgetPayload);

      expect(replayRes.status).toBe(403);
      expect(replayRes.body.error).toMatch(/Cannot replay idempotent request created by another user/);
    });
  });

  describe('P1-12: Preserving Dimensions on Journal Reversals', () => {
    it('preserves customer_id, vendor_id, and project_id dimensions on reversal journal lines', async () => {
      const projId = newId('prj-dim');
      const custId = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id;
      const vendId = MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id;

      await db.query(
        `INSERT INTO projects (id, organization_id, code, name, client_id, status)
         VALUES ($1, $2, 'PRJ-DIM', 'Dimension Project', $3, 'Active')`,
        [projId, orgId, custId]
      );

      const journalDate = '2026-03-10';
      const entryNumber = 'JRN-DIM-TEST-001';
      const posting = await ServerPostingEngine.postEntry({
        organizationId: orgId,
        entryNumber,
        date: journalDate,
        description: 'Original dimensional journal',
        lines: [
          {
            accountId: `acc-${orgId}-6000`,
            debit: 250,
            credit: 0,
            description: 'Dimensional debit',
            projectId: projId,
            customerId: custId,
            vendorId: vendId,
          },
          {
            accountId: `acc-${orgId}-1010`,
            debit: 0,
            credit: 250,
            description: 'Dimensional credit',
          },
        ],
      });

      const reversalJournalId = await db.transaction(async (txClient) => {
        return FinancialDestructiveActionsService.reversePostedJournal(
          txClient,
          orgId,
          posting.entryId,
          ownerUserId,
          'Audit test reversal',
          'test journal'
        );
      });

      const reversalLines = await db.query(
        `SELECT account_id, debit, credit, customer_id, vendor_id, project_id
           FROM journal_lines
          WHERE journal_entry_id = $1
          ORDER BY id`,
        [reversalJournalId]
      );

      expect(reversalLines.rows.length).toBe(2);
      const creditReversalLine = reversalLines.rows.find(
        (l) => l.account_id === `acc-${orgId}-6000`
      );
      expect(creditReversalLine).toBeDefined();
      expect(Number(creditReversalLine.credit)).toBe(250);
      expect(creditReversalLine.project_id).toBe(projId);
      expect(creditReversalLine.customer_id).toBe(custId);
      expect(creditReversalLine.vendor_id).toBe(vendId);
    });
  });

  describe('Amendment 4: Comprehensive Monetary Account Policy Matrix Test', () => {
    it('strictly evaluates isLiquidCashAsset and isEligiblePaymentAccount across all supported types and subtypes', () => {
      const testMatrix = [
        {
          name: 'Checking Account',
          account: { type: 'Asset', sub_type: 'Checking' },
          expectedLiquid: true,
          expectedInflow: true,
          expectedOutflow: true,
          expectedTransfer: true,
        },
        {
          name: 'Savings Account',
          account: { type: 'Asset', sub_type: 'Savings' },
          expectedLiquid: true,
          expectedInflow: true,
          expectedOutflow: true,
          expectedTransfer: true,
        },
        {
          name: 'Payment Clearing',
          account: { type: 'Asset', sub_type: 'Payment Clearing' },
          expectedLiquid: true,
          expectedInflow: true,
          expectedOutflow: true,
          expectedTransfer: true,
        },
        {
          name: 'Credit Card Liability',
          account: { type: 'Liability', sub_type: 'Credit Card' },
          expectedLiquid: false,
          expectedInflow: false,
          expectedOutflow: true,
          expectedTransfer: false,
        },
        {
          name: 'Bank Loan Liability',
          account: { type: 'Liability', sub_type: 'Bank Loan' },
          expectedLiquid: false,
          expectedInflow: false,
          expectedOutflow: false,
          expectedTransfer: false,
        },
        {
          name: 'Bank Charges Expense',
          account: { type: 'Expense', sub_type: 'Bank Charges' },
          expectedLiquid: false,
          expectedInflow: false,
          expectedOutflow: false,
          expectedTransfer: false,
        },
      ];

      for (const row of testMatrix) {
        expect(
          MonetaryAccountPolicy.isLiquidCashAsset(row.account),
          `${row.name} isLiquidCashAsset failed`
        ).toBe(row.expectedLiquid);

        expect(
          MonetaryAccountPolicy.isEligiblePaymentAccount('INFLOW', row.account),
          `${row.name} INFLOW failed`
        ).toBe(row.expectedInflow);

        expect(
          MonetaryAccountPolicy.isEligiblePaymentAccount('OUTFLOW', row.account),
          `${row.name} OUTFLOW failed`
        ).toBe(row.expectedOutflow);

        expect(
          MonetaryAccountPolicy.isEligiblePaymentAccount('TRANSFER', row.account),
          `${row.name} TRANSFER failed`
        ).toBe(row.expectedTransfer);
      }
    });
  });
});

