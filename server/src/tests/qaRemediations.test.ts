import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../database/db';
import { PaymentGatewayService } from '../services/PaymentGatewayService';
import { BankFeedSyncService } from '../banking/BankFeedSyncService';
import { DataMigrationService } from '../services/DataMigrationService';
import { JobSchedulerService } from '../jobs/JobSchedulerService';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';
import request from 'supertest';
import app from '../index';
import crypto from 'crypto';

const ORG = F.ORG_A.id;
const CUSTOMER_ID = F.CUSTOMERS.A1.id;
const VENDOR_ID = F.VENDORS.A1.id;
const OWNER_ID = F.PERSONAS.ORG_A.owner.id;

async function createCustomBankLedgerAndAccount(orgId: string, suffix: string) {
  const ledgerId = `acc-test-bank-${suffix}`;
  await db.query(
    `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status, is_system_account, is_locked)
     VALUES ($1, $2, $3, $4, 'Asset', 'Bank', 0.00, 'Active', FALSE, FALSE)
     ON CONFLICT (id) DO UPDATE SET balance = 0.00, is_system_account = FALSE, is_locked = FALSE`,
    [ledgerId, orgId, `199${suffix}`, `Test Bank Ledger ${suffix}`]
  );
  return await BankReconciliationService.createBankAccount(orgId, {
    ledgerAccountId: ledgerId,
    accountName: `Test Bank Profile ${suffix}`,
    bankName: 'Test Bank',
    accountNumber: `98765432${suffix}`,
    currency: 'INR',
    openingBalanceDate: '2026-01-01',
    currentBalance: 0,
  });
}

describe('QA Remediation Integration Test Suite', () => {
  beforeEach(async () => {
    await MasterFinanceFixture.setup();
    await db.query(`DELETE FROM vendor_refunds WHERE organization_id = $1`, [ORG]);
    await db.query(`DELETE FROM bank_accounts WHERE organization_id = $1`, [ORG]);
  });

  describe('1. Payment Gateway Webhook Subunit Normalization & Security', () => {
    it('normalizes Stripe amount and fee from subunits (cents to dollars)', async () => {
      // Create a $500 invoice
      const invoice = await SalesEngine.createAndPostInvoice(ORG, {
        customerId: CUSTOMER_ID,
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        lineItems: [{ description: 'Cloud Services', quantity: 1, unitPrice: 500, taxRate: 0 }],
      });
      expect(invoice.totalAmount).toBe(500);

      const payload = {
        id: 'evt_stripe_test_1',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 50000, // $500.00 in cents
            fee: 1250,     // $12.50 in cents
            currency: 'usd',
            status: 'succeeded',
            invoiceId: invoice.id,
            bankAccountId: `acc-${ORG}-1010`,
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const secret = 'whsec_stripe_test_secret';
      const timestamp = Math.floor(Date.now() / 1000);
      const hmac = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
      const signature = `t=${timestamp},v1=${hmac}`;

      const result = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'stripe',
        eventId: 'evt_stripe_test_1',
        eventType: 'payment_intent.succeeded',
        payload,
        rawBody,
        signature,
        webhookSecret: secret,
      });

      expect(result.status).toBe('PROCESSED');
      expect(result.paymentId).toBeDefined();

      // Verify payment was recorded for 500, not 50000
      const pmtRes = await db.query(
        `SELECT * FROM payments_received WHERE organization_id = $1 AND id = $2`,
        [ORG, result.paymentId]
      );
      expect(pmtRes.rows.length).toBe(1);
      expect(Number(pmtRes.rows[0].amount)).toBe(500);

      // Verify fee expense was recorded for 12.50, not 1250
      expect(result.expenseId).toBeDefined();
      const expRes = await db.query(
        `SELECT * FROM expenses WHERE organization_id = $1 AND id = $2`,
        [ORG, result.expenseId]
      );
      expect(expRes.rows.length).toBe(1);
      expect(Number(expRes.rows[0].amount)).toBe(12.5);
    });

    it('normalizes Razorpay amount and fee from subunits (paise to rupees)', async () => {
      // Create a ₹750 invoice
      const invoice = await SalesEngine.createAndPostInvoice(ORG, {
        customerId: CUSTOMER_ID,
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        lineItems: [{ description: 'Consulting', quantity: 1, unitPrice: 750, taxRate: 0 }],
      });
      expect(invoice.totalAmount).toBe(750);

      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_rzp_456',
              amount: 75000, // ₹750.00 in paise
              fee: 1500,     // ₹15.00 in paise
              currency: 'INR',
              status: 'captured',
              invoiceId: invoice.id,
              bankAccountId: `acc-${ORG}-1010`,
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const secret = 'rzp_sec_test_secret';
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const result = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'razorpay',
        eventId: 'evt_rzp_test_2',
        eventType: 'payment.captured',
        payload,
        rawBody,
        signature,
        webhookSecret: secret,
      });

      expect(result.status).toBe('PROCESSED');
      expect(result.paymentId).toBeDefined();

      const pmtRes = await db.query(
        `SELECT * FROM payments_received WHERE organization_id = $1 AND id = $2`,
        [ORG, result.paymentId]
      );
      expect(pmtRes.rows.length).toBe(1);
      expect(Number(pmtRes.rows[0].amount)).toBe(750);

      expect(result.expenseId).toBeDefined();
      const expRes = await db.query(
        `SELECT * FROM expenses WHERE organization_id = $1 AND id = $2`,
        [ORG, result.expenseId]
      );
      expect(expRes.rows.length).toBe(1);
      expect(Number(expRes.rows[0].amount)).toBe(15);
    });

    it('fails closed when webhook secret is missing for signature verification', () => {
      const isStripeValid = PaymentGatewayService.verifyWebhookSignature('payload', 'sig', '');
      expect(isStripeValid).toBe(false);

      const isRazorpayValid = PaymentGatewayService.verifyWebhookSignature('payload', 'sig', '');
      expect(isRazorpayValid).toBe(false);
    });

    it('rejects webhook endpoint with 400 when organizationId is missing', async () => {
      const response = await request(app)
        .post('/api/v1/public/webhooks/gateway/stripe')
        .set('stripe-signature', 't=123,v1=test')
        .send({ id: 'evt_test', type: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('ORGANIZATION_ID_REQUIRED');
    });
  });

  describe('2. BankFeedSyncService Key Production Enforcement', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.APP_ENCRYPTION_KEY;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      if (originalKey !== undefined) {
        process.env.APP_ENCRYPTION_KEY = originalKey;
      } else {
        delete process.env.APP_ENCRYPTION_KEY;
      }
    });

    it('throws error in production when APP_ENCRYPTION_KEY is not configured', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.APP_ENCRYPTION_KEY;

      expect(() => {
        BankFeedSyncService.encryptCredentials({ token: 'secret' });
      }).toThrow('APP_ENCRYPTION_KEY environment variable is required in production');
    });

    it('encrypts and decrypts credentials reliably with key', () => {
      process.env.APP_ENCRYPTION_KEY = 'test-encryption-key-for-qa-suit-32ch';
      const creds = { apiKey: 'secret-123', accountId: 'acc-999' };
      const encrypted = BankFeedSyncService.encryptCredentials(creds);
      expect(typeof encrypted).toBe('string');
      const decrypted = BankFeedSyncService.decryptCredentials(encrypted);
      expect(decrypted).toEqual(creds);
    });
  });

  describe('3. Opening Balance Synchronization with Bank Accounts', () => {
    it('updates current_balance on bank_accounts table when posting opening balances', async () => {
      const bankAccount = await createCustomBankLedgerAndAccount(ORG, 'ob1');
      const initialBankBalance = Number(bankAccount.currentBalance || 0);

      // Post opening balances referencing this bank account ledger
      await DataMigrationService.postOpeningBalances(
        ORG,
        {
          asOfDate: '2026-01-01',
          lines: [
            {
              accountId: bankAccount.ledgerAccountId,
              debit: 25000,
              credit: 0,
            },
            {
              accountId: `acc-${ORG}-3000`,
              debit: 0,
              credit: 25000,
            },
          ],
        },
        OWNER_ID
      );

      // Verify bank_accounts.current_balance was updated by +25000
      const updatedBankRes = await db.query(
        `SELECT current_balance FROM bank_accounts WHERE organization_id = $1 AND id = $2`,
        [ORG, bankAccount.id]
      );
      expect(Number(updatedBankRes.rows[0].current_balance)).toBe(initialBankBalance + 25000);
    });
  });

  describe('4. Job Scheduler Worker Concurrency & Locking', () => {
    it('claims pending jobs atomically without conflict', async () => {
      const job1 = await JobSchedulerService.scheduleJob(ORG, 'TEST_TASK_1', { p: 1 });
      const job2 = await JobSchedulerService.scheduleJob(ORG, 'TEST_TASK_2', { p: 2 });

      const worker1Jobs = await JobSchedulerService.claimJobs('worker-alpha', 10, 60);
      expect(worker1Jobs.length).toBeGreaterThanOrEqual(2);
      expect(worker1Jobs.some(j => j.id === job1.id)).toBe(true);
      expect(worker1Jobs.some(j => j.id === job2.id)).toBe(true);

      // A concurrent second worker claiming immediately finds none of the claimed jobs
      const worker2Jobs = await JobSchedulerService.claimJobs('worker-beta', 10, 60);
      expect(worker2Jobs.some(j => j.id === job1.id || j.id === job2.id)).toBe(false);
    });
  });

  describe('5. Sales Order Invoicing Rounding Epsilon', () => {
    it('marks sales order as INVOICED even when minor floating point variance occurs', async () => {
      const so = await SalesEngine.createSalesOrder(
        ORG,
        {
          customerId: CUSTOMER_ID,
          customerName: 'Customer A1',
          orderDate: '2026-03-01',
          status: 'CONFIRMED',
          lineItems: [
            { description: 'Service Part 1', quantity: 1, unitPrice: 33.33, amount: 33.33 },
            { description: 'Service Part 2', quantity: 1, unitPrice: 66.67, amount: 66.67 },
          ],
          totalAmount: 100,
          subtotal: 100,
        },
        undefined,
        OWNER_ID
      );

      // Invoice first part 33.33
      await SalesEngine.convertSalesOrderToInvoice(ORG, so.id, OWNER_ID, 33.33);
      const soPartial = await SalesEngine.getSalesOrder(ORG, so.id);
      expect(soPartial?.status).toBe('PARTIALLY_INVOICED');

      // Invoice remaining 66.67
      await SalesEngine.convertSalesOrderToInvoice(ORG, so.id, OWNER_ID, 66.67);
      const soFinal = await SalesEngine.getSalesOrder(ORG, so.id);
      expect(soFinal?.status).toBe('INVOICED');
    });
  });

  describe('6. Bank Account Deletion Protection against Vendor Refunds', () => {
    it('rejects bank account deletion when referenced by vendor refund', async () => {
      const bankAccount = await createCustomBankLedgerAndAccount(ORG, 'del1');
      const debitNote = await PurchasesEngine.createDebitNote(ORG, {
        vendorId: VENDOR_ID,
        date: '2026-03-14',
        items: [{ description: 'Refund source', quantity: 1, unitPrice: 500, taxRate: 0 }],
      });

      // Record a vendor refund depositing into this ledger account
      const refund = await PurchasesEngine.recordVendorRefund(ORG, {
        vendorId: VENDOR_ID,
        debitNoteId: debitNote.id,
        refundDate: '2026-03-15',
        amount: 500,
        depositToAccountId: bankAccount.ledgerAccountId,
        notes: 'Test refund referencing bank account',
      });
      expect(refund.refundId).toBeDefined();

      // Reset ledger and bank balances to 0 so balance checks do not mask the FK usage check
      await db.query(
        `UPDATE accounts SET balance = 0 WHERE organization_id = $1 AND id = $2`,
        [ORG, bankAccount.ledgerAccountId]
      );
      await db.query(
        `UPDATE bank_accounts SET current_balance = 0 WHERE organization_id = $1 AND id = $2`,
        [ORG, bankAccount.id]
      );

      // Attempt deletion: must reject due to vendor refund
      await expect(
        BankReconciliationService.deleteBankAccount(ORG, bankAccount.id, OWNER_ID)
      ).rejects.toThrow('The linked ledger account is used by a vendor refund');
    });
  });

  describe('7. PurchasesEngine Vendor Refund Audit Logging', () => {
    it('creates an audit log record on vendor refund creation', async () => {
      const bankAccount = await createCustomBankLedgerAndAccount(ORG, 'aud1');
      const debitNote = await PurchasesEngine.createDebitNote(ORG, {
        vendorId: VENDOR_ID,
        date: '2026-03-19',
        items: [{ description: 'Refund source', quantity: 1, unitPrice: 1200, taxRate: 0 }],
      });

      const refund = await PurchasesEngine.recordVendorRefund(ORG, {
        vendorId: VENDOR_ID,
        debitNoteId: debitNote.id,
        refundDate: '2026-03-20',
        amount: 1200,
        depositToAccountId: bankAccount.ledgerAccountId,
        reference: 'AUDIT-TEST-REF',
        notes: 'Audit log verification test',
      });

      const auditRes = await db.query(
        `SELECT * FROM audit_logs WHERE organization_id = $1 AND entity_id = $2 AND action = 'CREATE_VENDOR_REFUND'`,
        [ORG, refund.refundId]
      );

      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].entity_type).toBe('VENDOR_REFUND');
      const rawState = auditRes.rows[0].after_state;
      const afterState = typeof rawState === 'string' ? JSON.parse(rawState) : rawState;
      expect(afterState.amount).toBe(1200);
      expect(afterState.refundNumber).toBe(refund.refundNumber);
    });
  });
});
