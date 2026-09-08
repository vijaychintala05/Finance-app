import { db } from '../database/db';
import { DocumentInboxService } from './DocumentInboxService';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ExpensePostingService } from './ExpensePostingService';
import { newId } from '../utils/ids';

export interface OcrLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate?: number;
}

export interface OcrParsedData {
  vendorName: string;
  vendorInvoiceNumber: string;
  billDate: string;
  dueDate: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  lineItems: OcrLineItem[];
  confidence: number;
  rawText?: string;
}

export class DocumentOcrService {
  /**
   * Process and extract structured invoice/bill data from an inbox document.
   */
  public static async processDocument(
    orgId: string,
    docId: string,
    rawText?: string
  ): Promise<OcrParsedData> {
    const doc = await DocumentInboxService.getDocument(orgId, docId);

    const parsedData = this.parseDocumentContent(doc.filename, rawText);

    await DocumentInboxService.updateOcrData(orgId, docId, parsedData);

    return parsedData;
  }

  /**
   * Converts reviewed OCR data into a draft vendor bill.
   */
  public static async convertToDraftBill(
    orgId: string,
    docId: string,
    reviewData: {
      vendorId?: string;
      vendorName?: string;
      vendorInvoiceNumber?: string;
      billDate?: string;
      dueDate?: string;
      subtotal?: number;
      taxTotal?: number;
      discount?: number;
      totalAmount?: number;
      notes?: string;
      lineItems?: OcrLineItem[];
    },
    userId: string
  ): Promise<any> {
    const doc = await DocumentInboxService.getDocument(orgId, docId);

    // 1. Resolve or create Vendor
    let vendorId = reviewData.vendorId;
    let vendorName = reviewData.vendorName || 'Extracted Vendor';

    if (!vendorId && vendorName) {
      const existingVendor = await db.query(
        `SELECT id, name FROM vendors WHERE organization_id = $1 AND (name ILIKE $2 OR company_name ILIKE $2) LIMIT 1`,
        [orgId, vendorName.trim()]
      );

      if (existingVendor.rows.length > 0) {
        vendorId = existingVendor.rows[0].id;
        vendorName = existingVendor.rows[0].name;
      } else {
        // Create vendor master record
        const newVendorId = newId('vendor');
        await db.query(
          `INSERT INTO vendors (id, organization_id, name, company_name, created_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
          [newVendorId, orgId, vendorName.trim(), vendorName.trim()]
        );
        vendorId = newVendorId;
      }
    }

    const billDate = reviewData.billDate || new Date().toISOString().split('T')[0];
    const dueDate = reviewData.dueDate || billDate;
    const subtotal = Number(reviewData.subtotal || reviewData.totalAmount || 0);
    const taxTotal = Number(reviewData.taxTotal || 0);
    const discount = Number(reviewData.discount || 0);
    const totalAmount = reviewData.totalAmount !== undefined
      ? Number(reviewData.totalAmount)
      : Math.max(0, subtotal + taxTotal - discount);

    const items = (reviewData.lineItems && reviewData.lineItems.length > 0)
      ? reviewData.lineItems.map(item => ({
          description: item.description || 'Line item',
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || item.amount,
          amount: item.amount || ((item.quantity || 1) * (item.unitPrice || 0)),
        }))
      : [{
          description: `Bill from ${vendorName}`,
          quantity: 1,
          unitPrice: totalAmount,
          amount: totalAmount,
        }];

    // 2. Create Draft Bill via PurchasesEngine
    const bill = await PurchasesEngine.createAndPostBill(orgId, {
      vendorId: vendorId!,
      vendorName,
      vendorInvoiceNumber: reviewData.vendorInvoiceNumber || doc.filename.replace(/\.[^/.]+$/, ''),
      billDate,
      dueDate,
      subtotal,
      taxTotal,
      discount,
      totalAmount,
      balanceDue: totalAmount,
      status: 'DRAFT',
      notes: reviewData.notes || `Created from OCR inbox document ${doc.filename}`,
      lineItems: items,
    }, userId);

    // 3. Link inbox document
    await DocumentInboxService.linkDocument(orgId, docId, 'BILL', bill.id);

    return bill;
  }

  /**
   * Converts reviewed OCR data into an Expense record.
   */
  public static async convertToDraftExpense(
    orgId: string,
    docId: string,
    reviewData: {
      expenseAccountId?: string;
      paidFromAccountId?: string;
      vendorName?: string;
      date?: string;
      amount?: number;
      description?: string;
    },
    userId: string
  ): Promise<any> {
    const doc = await DocumentInboxService.getDocument(orgId, docId);

    // Resolve Expense Account
    let expenseAccountId = reviewData.expenseAccountId;
    if (!expenseAccountId) {
      const expAcc = await db.query(
        `SELECT id FROM accounts WHERE organization_id = $1 AND (classification = 'Expense' OR type = 'Expense') LIMIT 1`,
        [orgId]
      );
      expenseAccountId = expAcc.rows[0]?.id || 'acc-expense';
    }

    // Resolve Paid From Account (Cash / Bank)
    let paidFromAccountId = reviewData.paidFromAccountId;
    if (!paidFromAccountId) {
      const bankAcc = await db.query(
        `SELECT id FROM accounts WHERE organization_id = $1 AND (type = 'Bank' OR classification = 'Asset') LIMIT 1`,
        [orgId]
      );
      paidFromAccountId = bankAcc.rows[0]?.id || 'acc-bank';
    }

    const amount = Number(reviewData.amount || 0);
    const date = reviewData.date || new Date().toISOString().split('T')[0];

    const expense = await ExpensePostingService.createAndPost(orgId, userId, {
      expenseAccountId,
      paidFromAccountId,
      vendorName: reviewData.vendorName || 'Vendor',
      date,
      amount,
      description: reviewData.description || `Expense parsed from document ${doc.filename}`,
      receiptImages: doc.fileUrl ? [{
        name: doc.filename,
        mimeType: (doc.mimeType && doc.mimeType.startsWith('image/')) ? doc.mimeType : 'image/png',
        dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      }] : [],
    });

    // Link inbox document
    await DocumentInboxService.linkDocument(orgId, docId, 'EXPENSE', expense.id);

    return expense;
  }

  /**
   * Parses raw text or derives plausible fields from file naming / content.
   */
  private static parseDocumentContent(filename: string, rawText?: string): OcrParsedData {
    const today = new Date().toISOString().split('T')[0];
    const text = (rawText || '').trim();
    const hasText = text.length > 0;

    // Regex for amounts ($ or INR or decimal)
    const amountMatch = text.match(/(?:total(?:\s+amount)?|amount due|balance due|grand total)[\s:]*[$€£₹]?\s*([\d,]+\.?\d{0,2})/i);
    const subtotalMatch = text.match(/(?:subtotal|net amount)[\s:]*[$€£₹]?\s*([\d,]+\.?\d{0,2})/i);
    const taxMatch = text.match(/(?:tax|gst|vat)[\s:]*[$€£₹]?\s*([\d,]+\.?\d{0,2})/i);

    // Regex for invoice number
    const invNumMatch = text.match(/(?:invoice|bill|receipt|inv)[\s#:]*([A-Z0-9_-]{3,20})/i);

    // Regex for date
    const dateMatch = text.match(/\b(202\d[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01]))\b/);

    const parseNum = (val: string | undefined, fallback: number) => {
      if (!val) return fallback;
      const clean = val.replace(/,/g, '');
      const parsed = parseFloat(clean);
      return isNaN(parsed) ? fallback : Math.round(parsed * 100) / 100;
    };

    let total = parseNum(amountMatch?.[1], 0);
    let subtotal = parseNum(subtotalMatch?.[1], 0);
    let tax = parseNum(taxMatch?.[1], 0);

    if (total > 0 && subtotal === 0) {
      subtotal = Math.max(0, Math.round((total - tax) * 100) / 100);
    }

    // Determine vendor name from text
    let vendorName: string | undefined = undefined;
    const vMatch = text.match(/vendor:\s*([^\r\n]+)/i) || text.match(/(?:from|supplier|biller):\s*([^\r\n]+)/i);
    if (vMatch && vMatch[1].trim()) {
      vendorName = vMatch[1].trim();
    } else if (text.includes('Amazon Web Services')) {
      vendorName = 'Amazon Web Services';
    } else if (text.includes('Google LLC') || text.includes('Google Cloud')) {
      vendorName = 'Google Cloud';
    } else if (text.includes('GitHub')) {
      vendorName = 'GitHub Inc.';
    } else if (text.includes('Slack')) {
      vendorName = 'Slack Technologies';
    } else if (text.includes('Office Supplies Depot') || text.includes('Staples')) {
      vendorName = 'Office Supplies Depot';
    }

    const invoiceNumber = invNumMatch?.[1] || undefined;
    const billDate = dateMatch?.[1]?.replace(/[/.]/g, '-') || (hasText ? today : undefined);

    let dueDate: string | undefined = undefined;
    if (billDate) {
      const d = new Date(billDate);
      d.setDate(d.getDate() + 30);
      dueDate = d.toISOString().split('T')[0];
    }

    let confidence = 0.0;
    if (hasText) {
      let score = 0;
      if (total > 0) score += 0.4;
      if (vendorName) score += 0.3;
      if (invoiceNumber) score += 0.2;
      if (dateMatch) score += 0.1;
      confidence = Math.round(score * 100) / 100;
    }

    const lineItems = (total > 0)
      ? [
          {
            description: vendorName ? `Services provided by ${vendorName}` : 'Invoice line item',
            quantity: 1,
            unitPrice: subtotal || total,
            amount: subtotal || total,
            taxRate: tax > 0 ? 10 : 0,
          },
        ]
      : [];

    return {
      vendorName,
      vendorInvoiceNumber: invoiceNumber,
      billDate: billDate || today,
      dueDate: dueDate || today,
      subtotal,
      taxAmount: tax,
      totalAmount: total,
      currency: 'USD',
      lineItems,
      confidence,
      rawText: text || undefined,
    };
  }
}
