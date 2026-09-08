import { db } from '../database/db';

export interface SourceDocumentReference {
  type: 'INVOICE' | 'BILL' | 'PAYMENT_RECEIVED' | 'PAYMENT_MADE' | 'CREDIT_NOTE' | 'EXPENSE' | 'CUSTOMER_ADVANCE' | 'CUSTOMER_REFUND' | 'WRITE_OFF' | 'MANUAL_JOURNAL';
  id: string;
  documentNumber: string;
  date: string;
  partyId?: string | null;
  partyName?: string | null;
  amount: number;
  status: string;
  details?: any;
}

export interface JournalDrillDownResponse {
  journalEntry: {
    id: string;
    organizationId: string;
    entryNumber: string;
    date: string;
    reference: string;
    description: string;
    status: string;
    createdAt: string;
    lines: Array<{
      id: string;
      accountId: string;
      accountCode?: string;
      accountName?: string;
      debit: number;
      credit: number;
      description?: string;
      projectId?: string;
      customerId?: string;
      vendorId?: string;
    }>;
  };
  sourceDocument: SourceDocumentReference;
}

export function toIsoDate(value: any): string {
  if (!value) return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return str.slice(0, 10);
}

export class DrillDownService {
  public static async getDrillDown(orgId: string, journalEntryId: string): Promise<JournalDrillDownResponse> {
    const jeRes = await db.query(
      `SELECT * FROM journal_entries WHERE organization_id = $1 AND (id = $2 OR entry_number = $2)`,
      [orgId, journalEntryId]
    );
    if (jeRes.rows.length === 0) {
      throw new Error(`Journal entry ${journalEntryId} not found`);
    }
    const je = jeRes.rows[0];

    const linesRes = await db.query(
      `SELECT jl.*, a.code as account_code_resolved, a.name as account_name_resolved
       FROM journal_lines jl
       LEFT JOIN accounts a ON jl.account_id = a.id
       WHERE jl.journal_entry_id = $1
       ORDER BY jl.id ASC`,
      [je.id]
    );

    const lines = linesRes.rows.map((row: any) => ({
      id: row.id,
      accountId: row.account_id,
      accountCode: row.account_code || row.account_code_resolved,
      accountName: row.account_name || row.account_name_resolved,
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
      description: row.description || '',
      projectId: row.project_id || undefined,
      customerId: row.customer_id || undefined,
      vendorId: row.vendor_id || undefined,
    }));

    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);

    // Identify source document
    let sourceDoc: SourceDocumentReference | null = null;

    // 1. Invoices (including historical reversed or revised invoice journals)
    const invRes = await db.query(
      `SELECT * FROM invoices 
       WHERE organization_id = $1 
         AND (
           journal_entry_id = $2 
           OR reversal_journal_id = $2 
           OR invoice_number = $3 
           OR invoice_number = (SELECT reference FROM journal_entries WHERE id = $2)
           OR invoice_number = (SELECT reference FROM journal_entries WHERE id = (SELECT reversal_of_journal_id FROM journal_entries WHERE id = $2))
         ) 
       ORDER BY created_at DESC LIMIT 1`,
      [orgId, je.id, je.reference || '']
    );
    if (invRes.rows.length > 0) {
      const inv = invRes.rows[0];
      sourceDoc = {
        type: 'INVOICE',
        id: inv.id,
        documentNumber: inv.invoice_number,
        date: toIsoDate(inv.issue_date),
        partyId: inv.customer_id || inv.client_id,
        partyName: inv.client_name || 'Customer',
        amount: Number(inv.total_amount),
        status: inv.status,
        details: { balanceDue: Number(inv.balance_due), paidAmount: Number(inv.paid_amount) },
      };
    }

    // 2. Bills
    if (!sourceDoc) {
      const billRes = await db.query(
        `SELECT * FROM bills 
         WHERE organization_id = $1 
           AND (
             journal_entry_id = $2 
             OR bill_number = $3 
             OR vendor_invoice_number = $3 
             OR bill_number = (SELECT reference FROM journal_entries WHERE id = $2)
           ) 
         ORDER BY created_at DESC LIMIT 1`,
        [orgId, je.id, je.reference || '']
      );
      if (billRes.rows.length > 0) {
        const b = billRes.rows[0];
        sourceDoc = {
          type: 'BILL',
          id: b.id,
          documentNumber: b.bill_number,
          date: toIsoDate(b.bill_date),
          partyId: b.vendor_id,
          partyName: b.vendor_name || 'Vendor',
          amount: Number(b.total_amount),
          status: b.status,
          details: { balanceDue: Number(b.balance_due), amountPaid: Number(b.amount_paid) },
        };
      }
    }

    // 3. Customer Payments
    if (!sourceDoc) {
      const pmtRecRes = await db.query(
        `SELECT * FROM payments_received 
         WHERE organization_id = $1 
           AND (journal_entry_id = $2 OR reversal_journal_id = $2 OR payment_number = $3) 
         LIMIT 1`,
        [orgId, je.id, je.reference || '']
      );
      if (pmtRecRes.rows.length > 0) {
        const p = pmtRecRes.rows[0];
        sourceDoc = {
          type: 'PAYMENT_RECEIVED',
          id: p.id,
          documentNumber: p.payment_number,
          date: toIsoDate(p.payment_date),
          partyId: p.client_id,
          partyName: p.client_name || 'Customer',
          amount: Number(p.amount),
          status: p.status,
          details: { paymentMode: p.payment_mode, reference: p.reference },
        };
      }
    }

    // 4. Vendor Payments
    if (!sourceDoc) {
      const pmtMadeRes = await db.query(
        `SELECT * FROM payments_made 
         WHERE organization_id = $1 
           AND (journal_entry_id = $2 OR reversal_journal_id = $2 OR payment_number = $3) 
         LIMIT 1`,
        [orgId, je.id, je.reference || '']
      );
      if (pmtMadeRes.rows.length > 0) {
        const p = pmtMadeRes.rows[0];
        sourceDoc = {
          type: 'PAYMENT_MADE',
          id: p.id,
          documentNumber: p.payment_number,
          date: toIsoDate(p.payment_date),
          partyId: p.vendor_id,
          partyName: p.vendor_name || 'Vendor',
          amount: Number(p.amount),
          status: p.status,
          details: { paymentMode: p.payment_mode, reference: p.reference },
        };
      }
    }

    // 5. Credit Notes
    if (!sourceDoc) {
      const cnRes = await db.query(
        `SELECT * FROM credit_notes 
         WHERE organization_id = $1 
           AND (journal_entry_id = $2 OR reversal_journal_id = $2 OR credit_note_number = $3) 
         LIMIT 1`,
        [orgId, je.id, je.reference || '']
      );
      if (cnRes.rows.length > 0) {
        const cn = cnRes.rows[0];
        sourceDoc = {
          type: 'CREDIT_NOTE',
          id: cn.id,
          documentNumber: cn.credit_note_number,
          date: toIsoDate(cn.date),
          partyId: cn.client_id,
          partyName: cn.client_name || 'Customer',
          amount: Number(cn.total_amount),
          status: cn.status,
          details: { remainingCredit: Number(cn.remaining_credit), reason: cn.reason },
        };
      }
    }

    // 6. Expenses
    if (!sourceDoc) {
      const expRes = await db.query(
        `SELECT * FROM expenses 
         WHERE organization_id = $1 
           AND (journal_entry_id = $2 OR reversal_journal_id = $2 OR expense_number = $3) 
         LIMIT 1`,
        [orgId, je.id, je.reference || '']
      );
      if (expRes.rows.length > 0) {
        const exp = expRes.rows[0];
        sourceDoc = {
          type: 'EXPENSE',
          id: exp.id,
          documentNumber: exp.expense_number,
          date: toIsoDate(exp.date),
          partyId: null,
          partyName: exp.vendor_name || 'Vendor',
          amount: Number(exp.amount),
          status: exp.status,
          details: { description: exp.description },
        };
      }
    }

    // 7. Customer Refunds
    if (!sourceDoc) {
      const refRes = await db.query(
        `SELECT * FROM customer_refunds 
         WHERE organization_id = $1 
           AND (journal_entry_id = $2 OR refund_number = $3) 
         LIMIT 1`,
        [orgId, je.id, je.reference || '']
      );
      if (refRes.rows.length > 0) {
        const rf = refRes.rows[0];
        sourceDoc = {
          type: 'CUSTOMER_REFUND',
          id: rf.id,
          documentNumber: rf.refund_number,
          date: toIsoDate(rf.refund_date),
          partyId: rf.customer_id,
          partyName: 'Customer',
          amount: Number(rf.amount),
          status: 'COMPLETED',
          details: { reference: rf.reference, notes: rf.notes },
        };
      }
    }

    // 8. AR Write-Offs
    if (!sourceDoc) {
      const woRes = await db.query(
        `SELECT * FROM ar_write_offs 
         WHERE organization_id = $1 
           AND journal_entry_id = $2 
         LIMIT 1`,
        [orgId, je.id]
      );
      if (woRes.rows.length > 0) {
        const wo = woRes.rows[0];
        sourceDoc = {
          type: 'WRITE_OFF',
          id: wo.id,
          documentNumber: `WO-${wo.id.slice(0, 8)}`,
          date: toIsoDate(wo.write_off_date),
          partyId: wo.customer_id,
          partyName: 'Customer',
          amount: Number(wo.amount),
          status: 'POSTED',
          details: { reason: wo.reason },
        };
      }
    }

    // 9. Default to Manual Journal
    if (!sourceDoc) {
      sourceDoc = {
        type: 'MANUAL_JOURNAL',
        id: je.id,
        documentNumber: je.entry_number,
        date: toIsoDate(je.date),
        partyId: null,
        partyName: null,
        amount: Math.round(totalDebit * 100) / 100,
        status: je.status,
        details: { reference: je.reference, description: je.description },
      };
    }

    return {
      journalEntry: {
        id: je.id,
        organizationId: je.organization_id,
        entryNumber: je.entry_number,
        date: toIsoDate(je.date),
        reference: je.reference || '',
        description: je.description || '',
        status: je.status,
        createdAt: typeof je.created_at === 'string' ? je.created_at : new Date(je.created_at).toISOString(),
        lines,
      },
      sourceDocument: sourceDoc,
    };
  }
}
