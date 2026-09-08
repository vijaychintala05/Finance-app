import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { DocumentInboxService } from '../services/DocumentInboxService';
import { DocumentOcrService } from '../services/DocumentOcrService';
import { CustomerPortalService } from '../services/CustomerPortalService';
import { DataMigrationService } from '../services/DataMigrationService';
import { SavedViewsService } from '../services/SavedViewsService';
import { newId } from '../utils/ids';

describe('Stage 6 — Usability, Onboarding, and Document Handling Services', () => {
  const orgId = newId('org');
  const userId = newId('usr');
  const customerId = newId('cust');
  const vendorId = newId('ven');

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    // Set up test organization
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, 'PUB-STAGE6', 'STAGE6', 'Acme Global Corp', 'US', 'USD', '$', $3)
       ON CONFLICT DO NOTHING`,
      [orgId, `uuid-${orgId}`, userId]
    );

    // Set up test customer
    await db.query(
      `INSERT INTO customers (id, organization_id, display_name, legal_name, email, phone, currency, created_at)
       VALUES ($1, $2, 'Initech Inc', 'Initech Inc', 'billing@initech.example', '555-0199', 'USD', CURRENT_TIMESTAMP)`,
      [customerId, orgId]
    );

    // Set up test vendor
    await db.query(
      `INSERT INTO vendors (id, organization_id, name, company_name, email, currency, created_at)
       VALUES ($1, $2, 'PaperCo Supplies', 'PaperCo Supplies', 'orders@paperco.example', 'USD', CURRENT_TIMESTAMP)`,
      [vendorId, orgId]
    );

    // Set up default chart of accounts
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance)
       VALUES
       ('acc-cash', $1, '1010', 'Checking Account', 'Asset', 'Bank', 0.00),
       ('acc-ar', $1, '1200', 'Accounts Receivable', 'Asset', 'Accounts Receivable', 0.00),
       ('acc-ap', $1, '2000', 'Accounts Payable', 'Liability', 'Accounts Payable', 0.00),
       ('acc-equity', $1, '3000', 'Owner Equity', 'Equity', 'Equity', 0.00),
       ('acc-revenue', $1, '4000', 'Sales Revenue', 'Revenue', 'Sales Revenue', 0.00),
       ('acc-expense', $1, '5000', 'Office Supplies Expense', 'Expense', 'Operating Expense', 0.00)
       ON CONFLICT DO NOTHING`,
      [orgId]
    );
  });

  describe('1. Document Inbox & OCR Extraction', () => {
    let uploadedDocId: string;

    it('uploads a document into inbox with initial UPLOADED status', async () => {
      const doc = await DocumentInboxService.uploadDocument(orgId, {
        filename: 'invoice_paperco_8920.pdf',
        fileUrl: 'https://storage.example.com/inbox/invoice_paperco_8920.pdf',
        mimeType: 'application/pdf',
        fileSize: 45200,
        uploadedBy: userId,
      });

      expect(doc).toBeDefined();
      expect(doc.id).toBeDefined();
      expect(doc.status).toBe('UPLOADED');
      expect(doc.filename).toBe('invoice_paperco_8920.pdf');
      uploadedDocId = doc.id;
    });

    it('lists and filters documents in inbox', async () => {
      const list = await DocumentInboxService.listDocuments(orgId, {
        status: 'UPLOADED',
        search: 'paperco',
      });

      expect(list.total).toBeGreaterThanOrEqual(1);
      expect(list.items.some(i => i.id === uploadedDocId)).toBe(true);
    });

    it('extracts OCR metadata from the document and marks it PROCESSED', async () => {
      const ocrResult = await DocumentOcrService.processDocument(
        orgId,
        uploadedDocId,
        'Vendor: PaperCo Supplies\nInvoice #: INV-8920\nTotal Amount: $450.00\nSubtotal: $400.00\nTax: $50.00\nDate: 2026-09-01'
      );

      expect(ocrResult.vendorName).toBe('PaperCo Supplies');
      expect(ocrResult.vendorInvoiceNumber).toBe('INV-8920');
      expect(ocrResult.totalAmount).toBe(450);
      expect(ocrResult.subtotal).toBe(400);
      expect(ocrResult.taxAmount).toBe(50);
      expect(ocrResult.billDate).toBe('2026-09-01');

      const updatedDoc = await DocumentInboxService.getDocument(orgId, uploadedDocId);
      expect(updatedDoc.status).toBe('PROCESSED');
      expect(updatedDoc.ocrData).toBeDefined();
    });

    it('converts reviewed OCR data into a draft Vendor Bill and links inbox record', async () => {
      const bill = await DocumentOcrService.convertToDraftBill(
        orgId,
        uploadedDocId,
        {
          vendorId,
          vendorName: 'PaperCo Supplies',
          vendorInvoiceNumber: 'INV-8920',
          billDate: '2026-09-01',
          dueDate: '2026-10-01',
          subtotal: 400,
          taxTotal: 50,
          totalAmount: 450,
          lineItems: [
            { description: 'Printer Paper 10 Reams', quantity: 10, unitPrice: 40, amount: 400, taxRate: 12.5 },
          ],
        },
        userId
      );

      expect(bill).toBeDefined();
      expect(bill.id).toBeDefined();
      expect(bill.status).toBe('DRAFT');
      expect(bill.totalAmount).toBe(450);

      const linkedDoc = await DocumentInboxService.getDocument(orgId, uploadedDocId);
      expect(linkedDoc.status).toBe('LINKED');
      expect(linkedDoc.linkedDocumentType).toBe('BILL');
      expect(linkedDoc.linkedDocumentId).toBe(bill.id);
    });

    it('converts an inbox document into an Expense and links it', async () => {
      const expDoc = await DocumentInboxService.uploadDocument(orgId, {
        filename: 'uber_receipt_45.png',
        fileUrl: 'https://storage.example.com/inbox/uber_receipt_45.png',
        mimeType: 'image/png',
        fileSize: 12000,
      });

      const expense = await DocumentOcrService.convertToDraftExpense(
        orgId,
        expDoc.id,
        {
          vendorName: 'Uber Rides',
          date: '2026-09-05',
          amount: 45.50,
          description: 'Client visit transportation',
          expenseAccountId: 'acc-expense',
          paidFromAccountId: 'acc-cash',
        },
        userId
      );

      expect(expense).toBeDefined();
      expect(expense.amount).toBe(45.50);

      const updatedExpDoc = await DocumentInboxService.getDocument(orgId, expDoc.id);
      expect(updatedExpDoc.status).toBe('LINKED');
      expect(updatedExpDoc.linkedDocumentType).toBe('EXPENSE');
      expect(updatedExpDoc.linkedDocumentId).toBe(expense.id);
    });
  });

  describe('2. Customer Portal Service', () => {
    let portalToken: string;

    beforeAll(async () => {
      // Seed an invoice for the customer
      await db.query(
        `INSERT INTO invoices (id, organization_id, customer_id, client_id, client_name, invoice_number, issue_date, due_date, total_amount, balance_due, status, created_at)
         VALUES ($1, $2, $3, $3, 'Initech Inc', 'INV-2026-001', '2026-09-01', '2026-09-15', 1200.00, 1200.00, 'POSTED', CURRENT_TIMESTAMP)`,
        [newId('inv'), orgId, customerId]
      );
    });

    it('generates a secure customer portal token', async () => {
      const result = await CustomerPortalService.generatePortalToken(orgId, customerId, 30);
      expect(result.token).toBeDefined();
      expect(result.token.length).toBe(64);
      expect(result.expiresAt).toBeDefined();
      portalToken = result.token;
    });

    it('fetches portal context including organization, customer, open invoices and balance', async () => {
      const ctx = await CustomerPortalService.getPortalContext(portalToken);

      expect(ctx.organization.name).toBe('Acme Global Corp');
      expect(ctx.customer.name).toBe('Initech Inc');
      expect(ctx.summary.totalOutstanding).toBe(1200.00);
      expect(ctx.summary.openInvoicesCount).toBe(1);
      expect(ctx.invoices.length).toBeGreaterThanOrEqual(1);
      expect(ctx.invoices[0].invoiceNumber).toBe('INV-2026-001');
    });

    it('fetches customer statement via portal token', async () => {
      const stmt = await CustomerPortalService.getPortalStatement(portalToken, '2026-01-01', '2026-12-31');
      expect(stmt).toBeDefined();
      expect(stmt.customerName).toBe('Initech Inc');
      expect(stmt.totalInvoices).toBe(1200.00);
      expect(stmt.closingBalance).toBe(1200.00);
    });

    it('processes online payment from portal and updates invoice balance', async () => {
      const ctx = await CustomerPortalService.getPortalContext(portalToken);
      const inv = ctx.invoices.find(i => i.invoiceNumber === 'INV-2026-001')!;

      const payResult = await CustomerPortalService.processPortalPayment(portalToken, {
        invoiceId: inv.id,
        amount: 500,
        paymentMethod: 'ONLINE_CARD',
        reference: 'TXN-PORTAL-TEST',
      });

      expect(payResult.success).toBe(true);
      expect(payResult.paymentNumber).toBeDefined();
      expect(payResult.remainingBalance).toBe(700);

      // Verify updated context
      const updatedCtx = await CustomerPortalService.getPortalContext(portalToken);
      expect(updatedCtx.summary.totalOutstanding).toBe(700);
      expect(updatedCtx.recentPayments.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects invalid or expired portal token', async () => {
      await expect(CustomerPortalService.getPortalContext('non-existent-token')).rejects.toThrow(
        /Invalid or expired portal token/
      );
    });


    it('revokes customer portal tokens', async () => {
      await CustomerPortalService.revokePortalTokens(orgId, customerId);
      await expect(CustomerPortalService.getPortalContext(portalToken)).rejects.toThrow(
        /Invalid or expired portal token/
      );
    });
  });

  describe('3. Data Migration & Opening Balance Reconciliation', () => {
    it('detects unbalanced opening balance lines and provides equity adjustment suggestion', async () => {
      const unbalancedLines = [
        { accountCode: '1010', debit: 5000, credit: 0, accountName: 'Cash' },
        { accountCode: '1200', debit: 3000, credit: 0, accountName: 'Accounts Receivable' },
        { accountCode: '2000', debit: 0, credit: 2000, accountName: 'Accounts Payable' },
      ];

      const preview = await DataMigrationService.previewOpeningBalances(orgId, unbalancedLines);

      expect(preview.totalDebits).toBe(8000);
      expect(preview.totalCredits).toBe(2000);
      expect(preview.variance).toBe(6000);
      expect(preview.isBalanced).toBe(false);
      expect(preview.suggestedEquityAdjustment).toEqual({
        accountId: 'acc-opening-balance-equity',
        accountCode: '3999',
        accountName: 'Opening Balance Equity',
        debit: 0,
        credit: 6000,
      });
    });

    it('rejects posting unbalanced opening balances when autoBalanceWithEquity is false', async () => {
      const unbalancedLines = [
        { accountCode: '1010', debit: 5000, credit: 0 },
        { accountCode: '2000', debit: 0, credit: 2000 },
      ];

      await expect(
        DataMigrationService.postOpeningBalances(
          orgId,
          { asOfDate: '2026-01-01', lines: unbalancedLines, autoBalanceWithEquity: false },
          userId
        )
      ).rejects.toThrow(/MIGRATION_OUT_OF_BALANCE/);
    });

    it('posts balanced opening balances directly, creating balanced GL journal entry and updating accounts', async () => {
      const balancedLines = [
        { accountCode: '1010', debit: 10000, credit: 0, accountName: 'Checking Account' },
        { accountCode: '2000', debit: 0, credit: 4000, accountName: 'Accounts Payable' },
        { accountCode: '3000', debit: 0, credit: 6000, accountName: 'Owner Equity' },
      ];

      const result = await DataMigrationService.postOpeningBalances(
        orgId,
        { asOfDate: '2026-01-01', lines: balancedLines },
        userId
      );

      expect(result.journalEntryId).toBeDefined();
      expect(result.entryNumber).toBe('JE-OPENING-BAL');
      expect(result.totalDebits).toBe(10000);
      expect(result.totalCredits).toBe(10000);
      expect(result.linesPosted).toBe(3);

      // Verify journal entry lines in DB
      const linesRes = await db.query(
        `SELECT SUM(debit) as debits, SUM(credit) as credits FROM journal_lines WHERE journal_entry_id = $1`,
        [result.journalEntryId]
      );
      expect(Number(linesRes.rows[0].debits)).toBe(10000);
      expect(Number(linesRes.rows[0].credits)).toBe(10000);
    });

    it('posts unbalanced lines with autoBalanceWithEquity = true, balancing perfectly with Opening Balance Equity', async () => {
      const lines = [
        { accountCode: '1010', debit: 7500, credit: 0 },
        { accountCode: '2000', debit: 0, credit: 2500 },
      ];

      const result = await DataMigrationService.postOpeningBalances(
        orgId,
        { asOfDate: '2026-01-01', lines, autoBalanceWithEquity: true },
        userId
      );

      expect(result.totalDebits).toBe(7500);
      expect(result.totalCredits).toBe(7500);
      expect(result.linesPosted).toBe(3); // 2 original + 1 balancing equity line
    });

    it('bulk imports master data with deduplication', async () => {
      const customersToImport = [
        { name: 'Globex Corp', email: 'hank@globex.example' },
        { name: 'Initech Inc', email: 'duplicate@initech.example' }, // duplicate, should be skipped
        { name: 'Massive Dynamic', email: 'info@massivedynamic.example' },
      ];

      const importResult = await DataMigrationService.importMasterData(orgId, 'CUSTOMERS', customersToImport);

      expect(importResult.imported).toBe(2);
      expect(importResult.skipped).toBe(1);
      expect(importResult.errors.length).toBe(0);
    });
  });

  describe('4. Saved Views Management', () => {
    let createdViewId: string;

    it('creates and lists saved views with filter and sort configurations', async () => {
      const view = await SavedViewsService.createView(orgId, userId, {
        entityType: 'INVOICES',
        name: 'Overdue high-value invoices',
        filters: { status: 'OVERDUE', minAmount: 1000 },
        sortConfig: { field: 'dueDate', direction: 'asc' },
        isDefault: true,
      });

      expect(view.id).toBeDefined();
      expect(view.name).toBe('Overdue high-value invoices');
      expect(view.isDefault).toBe(true);
      createdViewId = view.id;

      const list = await SavedViewsService.listViews(orgId, userId, 'INVOICES');
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.some(v => v.id === createdViewId)).toBe(true);
    });

    it('deletes saved view', async () => {
      const deleted = await SavedViewsService.deleteView(orgId, userId, createdViewId);
      expect(deleted).toBe(true);

      const list = await SavedViewsService.listViews(orgId, userId, 'INVOICES');
      expect(list.some(v => v.id === createdViewId)).toBe(false);
    });
  });
});
