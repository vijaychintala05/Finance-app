import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../database/db';
import { SalesEngine } from '../sales/SalesEngine';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';

const org = F.ORG_A.id;
const owner = F.PERSONAS.ORG_A.owner.id;

describe('Invoice revision transaction safety', () => {
  beforeEach(async () => { await MasterFinanceFixture.setup(); });
  afterEach(() => { vi.restoreAllMocks(); });

  async function createInvoice() {
    return SalesEngine.createAndPostInvoice(org, {
      customerId: F.CUSTOMERS.A1.id,
      issueDate: '2026-03-01', dueDate: '2026-03-31',
      lineItems: [{ description: 'Consulting', quantity: 1, unitPrice: 100, taxRate: 0 }],
    });
  }

  const revision = {
    items: [{ description: 'Revised consulting', quantity: 1, unitPrice: 200, taxRate: 0 }],
    editReason: 'Customer approved additional consulting',
  };

  async function snapshot(invoiceId: string) {
    const tables = ['invoices', 'invoice_items', 'journal_entries', 'journal_lines', 'accounts', 'customers', 'audit_logs'];
    const state: Record<string, unknown> = {};
    for (const table of tables) {
      state[table] = (await db.query(`SELECT * FROM ${table} WHERE organization_id = $1 ORDER BY id`, [org])).rows;
    }
    expect((state.invoices as any[]).some(row => row.id === invoiceId)).toBe(true);
    return state;
  }

  it('aborts the edit when reversing the original posting fails', async () => {
    const invoice = await createInvoice();
    const before = await snapshot(invoice.id);
    vi.spyOn(FinancialDestructiveActionsService, 'reversePostedJournal')
      .mockRejectedValueOnce(new Error('Original journal is not reversible'));

    await expect(SalesEngine.updateInvoice(org, invoice.id, revision, owner))
      .rejects.toThrow('Original journal is not reversible');
    expect(await snapshot(invoice.id)).toEqual(before);
  });

  it('rolls back a completed reversal when the replacement posting fails', async () => {
    const invoice = await createInvoice();
    const before = await snapshot(invoice.id);
    const originalPost = ServerPostingEngine.postEntry.bind(ServerPostingEngine);
    let calls = 0;
    vi.spyOn(ServerPostingEngine, 'postEntry').mockImplementation(async (...args) => {
      if (++calls === 2) throw new Error('Replacement posting failed');
      return originalPost(...args);
    });

    await expect(SalesEngine.updateInvoice(org, invoice.id, revision, owner))
      .rejects.toThrow('Replacement posting failed');
    expect(calls).toBe(2);
    expect(await snapshot(invoice.id)).toEqual(before);
  });

  it('links original, reversal and replacement without doubling the receivable', async () => {
    const invoice = await createInvoice();
    const updated = await SalesEngine.updateInvoice(org, invoice.id, revision, owner);
    expect(updated.totalAmount).toBe(200);
    expect(updated.journalEntryId).not.toBe(invoice.journalEntryId);
    const journals = (await db.query('SELECT * FROM journal_entries WHERE organization_id = $1', [org])).rows;
    expect(journals).toHaveLength(3);
    const original = journals.find(row => row.id === invoice.journalEntryId);
    const reversal = journals.find(row => row.id === original.reversed_by_journal_id);
    expect(reversal.reversal_of_journal_id).toBe(invoice.journalEntryId);
    const ar = await db.query("SELECT balance FROM accounts WHERE organization_id = $1 AND code = '1100'", [org]);
    expect(Number(ar.rows[0].balance)).toBe(200);
  });
});
