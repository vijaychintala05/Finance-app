import PDFDocument from 'pdfkit';
import { type DbQueryClient } from '../database/db';
import { amountToWords } from '../utils/numberToWords';

export class ExpensePdfService {
  /**
   * Safe text encoder to sanitize string operands
   */
  public static sanitizeText(input: any): string {
    if (input === null || input === undefined) return '';
    return String(input)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
      .trim();
  }

  /**
   * Currency formatter with ISO symbol
   */
  public static formatAmount(amount: number, currency: string = 'USD'): string {
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const formattedNumber = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
    return `${currency} ${formattedNumber}`;
  }

  /**
   * Generates a certified Expense Payment Voucher PDF with full GL breakdown and receipt image annexures
   */
  public static async generateExpensePdf(
    client: DbQueryClient,
    organizationId: string,
    expenseId: string
  ): Promise<Buffer> {
    // 1. Fetch Expense
    const expenseRes = await client.query(
      `SELECT * FROM expenses WHERE organization_id = $1 AND id = $2`,
      [organizationId, expenseId]
    );
    if (expenseRes.rows.length === 0) {
      throw new Error(`Expense record not found: ${expenseId}`);
    }
    const exp = expenseRes.rows[0];

    // 2. Fetch Organization Details
    const orgRes = await client.query(
      `SELECT * FROM organizations WHERE id = $1`,
      [organizationId]
    );
    const org = orgRes.rows[0] || {};

    // 3. Organization Base Currency
    const currencySymbol = org.base_currency || 'USD';

    // 4. Fetch Accounts involved (including any itemized lines)
    const itemsList: Array<{ id?: string; accountId: string; description?: string; amount: number }> =
      exp.is_itemized && exp.items
        ? (typeof exp.items === 'string' ? JSON.parse(exp.items) : (exp.items || []))
        : [];

    const itemAccountIds = itemsList.map((it) => it.accountId).filter(Boolean);
    const allAccountIds = Array.from(new Set([exp.expense_account_id, exp.paid_from_account_id, ...itemAccountIds]));

    const placeholders = allAccountIds.map((_, i) => String.fromCharCode(36) + (i + 2)).join(', ');
    const accountsRes = await client.query(
      `SELECT id, name, code, type FROM accounts
        WHERE organization_id = $1 AND id IN (${placeholders})`,
      [organizationId, ...allAccountIds]
    );
    const accountMap = new Map<string, string>();
    accountsRes.rows.forEach((acc) => {
      accountMap.set(acc.id, `${acc.code ? acc.code + ' - ' : ''}${acc.name}`);
    });

    const expenseAccountName = accountMap.get(exp.expense_account_id) || 'Operating Expense';
    const paidFromAccountName = accountMap.get(exp.paid_from_account_id) || 'Operating Bank Account';

    // 5. Fetch Attached Receipt Images
    const receiptsRes = await client.query(
      `SELECT id, file_name, mime_type, byte_size, content_base64
         FROM expense_receipt_attachments
        WHERE organization_id = $1 AND expense_id = $2
        ORDER BY created_at ASC`,
      [organizationId, expenseId]
    );
    const receipts = receiptsRes.rows;

    const primaryColor = '#0284c7'; // Professional slate-cyan
    const amount = Number(exp.amount || 0);
    const taxAmount = Number(exp.tax_amount || 0);
    const totalAmount = Number(exp.total_amount ?? (amount + taxAmount));
    const words = amountToWords(totalAmount, currencySymbol);
    const voucherNumber = exp.expense_number || `EXP-${exp.id.slice(0, 8).toUpperCase()}`;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        // --- PAGE 1: EXPENSE PAYMENT VOUCHER ---
        // Top Brand Accent Line
        doc.rect(40, 35, 515, 3).fill(primaryColor);

        // Header Title & Voucher Number
        doc.fontSize(18).font('Helvetica-Bold').fillColor(primaryColor).text('EXPENSE PAYMENT VOUCHER', 40, 46, { width: 320 });
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text(voucherNumber, 340, 48, { width: 215, align: 'right' });

        // Status Badge
        const statusText = (exp.status || 'POSTED').toUpperCase();
        doc.roundedRect(475, 64, 80, 16, 3).fillAndStroke('#f1f5f9', '#cbd5e1');
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#0369a1').text(statusText, 475, 68, { width: 80, align: 'center' });

        let curY = 88;

        // Organization Info (Left)
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text(org.name || 'Organization', 40, curY, { width: 270 });
        curY += 14;

        const orgAddress = [org.address, org.city, org.state, org.country, org.zip_code].filter(Boolean).join(', ');
        if (orgAddress) {
          doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(orgAddress, 40, curY, { width: 270 });
          curY += doc.heightOfString(orgAddress, { width: 270 }) + 2;
        }
        if (org.tax_id || org.gstin) {
          doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(`GSTIN / Tax ID: ${org.tax_id || org.gstin}`, 40, curY, { width: 270 });
          curY += 12;
        }

        // Voucher Metadata (Right)
        let rightY = 88;
        doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
        doc.text(`Voucher Date: ${exp.date || new Date().toISOString().split('T')[0]}`, 320, rightY, { width: 235, align: 'right' });
        rightY += 13;
        doc.text(`Payment Method: ${exp.payment_method || 'Bank / Cash'}`, 320, rightY, { width: 235, align: 'right' });
        rightY += 13;
        if (exp.reference_number) {
          doc.text(`Ref / Chq #: ${exp.reference_number}`, 320, rightY, { width: 235, align: 'right' });
          rightY += 13;
        }
        if (exp.project_id) {
          doc.text(`Project Ref: ${exp.project_id}`, 320, rightY, { width: 235, align: 'right' });
          rightY += 13;
        }

        curY = Math.max(curY, rightY + 8);

        // Divider
        doc.moveTo(40, curY).lineTo(555, curY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        curY += 10;

        // --- DISBURSEMENT & BENEFICIARY CARD ---
        const cardY = curY;
        doc.roundedRect(40, cardY, 515, 60, 4).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.fontSize(8).font('Helvetica-Bold').fillColor(primaryColor).text('DISBURSEMENT & BENEFICIARY DETAILS', 50, cardY + 7);

        // Left Column: Payee / Vendor
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b').text('PAID TO / VENDOR:', 50, cardY + 22);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a').text(exp.vendor_name || 'Direct Expense / Petty Cash', 50, cardY + 34, { width: 220 });

        // Right Column: Disbursed From & Classification
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b').text('DISBURSED FROM ACCOUNT:', 300, cardY + 22);
        doc.fontSize(8.5).font('Helvetica').fillColor('#334155').text(paidFromAccountName, 300, cardY + 34, { width: 240 });

        curY = cardY + 68;

        // --- ACCOUNTING ALLOCATION TABLE ---
        const tableHeaderY = curY;
        doc.roundedRect(40, tableHeaderY, 515, 20, 3).fill(primaryColor);
        doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
        doc.text('#', 46, tableHeaderY + 6, { width: 20 });
        doc.text('ACCOUNT / CATEGORY', 70, tableHeaderY + 6, { width: 170 });
        doc.text('MEMO / DESCRIPTION', 245, tableHeaderY + 6, { width: 160 });
        doc.text('DEBIT', 410, tableHeaderY + 6, { width: 65, align: 'right' });
        doc.text('CREDIT', 485, tableHeaderY + 6, { width: 65, align: 'right' });

        curY = tableHeaderY + 24;

        let rowCount = 0;

        if (exp.is_itemized && itemsList.length > 0) {
          // Render itemized lines
          for (const item of itemsList) {
            rowCount++;
            const itAccName = accountMap.get(item.accountId) || 'Operating Expense';
            doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(String(rowCount), 46, curY);
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text(itAccName, 70, curY, { width: 170 });
            doc.fontSize(8).font('Helvetica').fillColor('#475569').text(item.description || exp.description || 'Expense item', 245, curY, { width: 160 });
            doc.fontSize(8.5).font('Helvetica').fillColor('#0f172a').text(this.formatAmount(Number(item.amount), currencySymbol), 410, curY, { width: 65, align: 'right' });
            doc.text('-', 485, curY, { width: 65, align: 'right' });

            curY += 22;
            doc.moveTo(40, curY - 2).lineTo(555, curY - 2).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
          }
        } else {
          // Row 1: Single Expense Account Debit
          rowCount++;
          doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(String(rowCount), 46, curY);
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text(expenseAccountName, 70, curY, { width: 170 });
          doc.fontSize(8).font('Helvetica').fillColor('#475569').text(exp.description || 'Expense distribution', 245, curY, { width: 160 });
          doc.fontSize(8.5).font('Helvetica').fillColor('#0f172a').text(this.formatAmount(amount, currencySymbol), 410, curY, { width: 65, align: 'right' });
          doc.text('-', 485, curY, { width: 65, align: 'right' });

          curY += 22;
          doc.moveTo(40, curY - 2).lineTo(555, curY - 2).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        }

        // Row: Input Tax Debit (if tax applied)
        if (taxAmount > 0) {
          rowCount++;
          doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(String(rowCount), 46, curY);
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text('Input GST / Tax Paid', 70, curY, { width: 170 });
          doc.fontSize(8).font('Helvetica').fillColor('#475569').text('Tax on Expense', 245, curY, { width: 160 });
          doc.fontSize(8.5).font('Helvetica').fillColor('#0f172a').text(this.formatAmount(taxAmount, currencySymbol), 410, curY, { width: 65, align: 'right' });
          doc.text('-', 485, curY, { width: 65, align: 'right' });

          curY += 22;
          doc.moveTo(40, curY - 2).lineTo(555, curY - 2).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        }

        // Credit Row: Paid From Account Credit
        rowCount++;
        doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(String(rowCount), 46, curY);
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text(paidFromAccountName, 70, curY, { width: 170 });
        doc.fontSize(8).font('Helvetica').fillColor('#475569').text('Payment Disbursement', 245, curY, { width: 160 });
        doc.fontSize(8.5).font('Helvetica').fillColor('#0f172a').text('-', 410, curY, { width: 65, align: 'right' });
        doc.text(this.formatAmount(totalAmount, currencySymbol), 485, curY, { width: 65, align: 'right' });

        curY += 22;
        doc.moveTo(40, curY - 2).lineTo(555, curY - 2).strokeColor('#cbd5e1').lineWidth(0.75).stroke();

        // Totals Box
        curY += 6;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569');
        doc.text(`Net Expense: ${this.formatAmount(amount, currencySymbol)}`, 320, curY, { width: 235, align: 'right' });
        curY += 14;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a');
        doc.text(`Total Disbursed: ${this.formatAmount(totalAmount, currencySymbol)}`, 320, curY, { width: 235, align: 'right' });

        // Amount in Words Box
        curY += 18;
        doc.roundedRect(40, curY, 515, 34, 4).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b').text('Amount in Words:', 50, curY + 6);
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text(words, 50, curY + 18, { width: 495 });

        curY += 46;

        // Signatures & Approvals Section
        doc.roundedRect(40, curY, 245, 65, 3).strokeColor('#e2e8f0').stroke();
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b').text('RECORDED / PREPARED BY', 48, curY + 8);
        doc.fontSize(8.5).font('Helvetica').fillColor('#334155').text(exp.created_by || 'System User', 48, curY + 22);
        doc.fontSize(7.5).font('Helvetica').fillColor('#94a3b8').text(`Date: ${exp.date || new Date().toISOString().split('T')[0]}`, 48, curY + 46);

        doc.roundedRect(310, curY, 245, 65, 3).strokeColor('#e2e8f0').stroke();
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b').text('VERIFIED & APPROVED BY', 318, curY + 8);
        doc.fontSize(8.5).font('Helvetica').fillColor('#334155').text('Authorized Approver', 318, curY + 22);
        doc.fontSize(7.5).font('Helvetica').fillColor('#94a3b8').text('Signature _______________________', 318, curY + 46);

        // --- PAGE 2+: RECEIPT ATTACHMENTS DOSSIER ---
        if (receipts.length > 0) {
          doc.addPage();
          doc.rect(40, 35, 515, 3).fill(primaryColor);
          doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text('ANNEXURE: ATTACHED DIGITAL RECEIPTS', 40, 48, { width: 515 });
          doc.fontSize(8.5).font('Helvetica').fillColor('#64748b').text(`Supporting documentation dossier for Voucher #${voucherNumber} (${receipts.length} attachment${receipts.length === 1 ? '' : 's'})`, 40, 68);

          let receiptY = 90;

          for (let i = 0; i < receipts.length; i++) {
            const r = receipts[i];
            if (receiptY > 620) {
              doc.addPage();
              receiptY = 50;
            }

            // Receipt Box
            doc.roundedRect(40, receiptY, 515, 25, 3).fillAndStroke('#f1f5f9', '#cbd5e1');
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text(`Receipt ${i + 1}: ${r.file_name}`, 50, receiptY + 7);
            doc.fontSize(7.5).font('Helvetica').fillColor('#64748b').text(`${r.mime_type} ? ${Math.round(r.byte_size / 1024)} KB`, 380, receiptY + 8, { width: 165, align: 'right' });

            receiptY += 32;

            if (r.content_base64) {
              try {
                const imgBuf = Buffer.from(r.content_base64, 'base64');
                doc.image(imgBuf, 40, receiptY, {
                  fit: [515, 260],
                  align: 'center',
                  valign: 'center',
                });
                receiptY += 275;
              } catch {
                doc.fontSize(8).font('Helvetica-Oblique').fillColor('#94a3b8').text('[Receipt image preview could not be rendered]', 50, receiptY + 10);
                receiptY += 30;
              }
            } else {
              receiptY += 10;
            }
          }
        }

        // --- FOOTERS (APPLY TO ALL PAGES) ---
        const pageRange = doc.bufferedPageRange();
        for (let i = 0; i < pageRange.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(7).font('Helvetica').fillColor('#94a3b8').text(
            `Certified Expense Payment Voucher ? Generated by FirmBooks ? Page ${i + 1} of ${pageRange.count}`,
            40,
            800,
            { align: 'center', width: 515 }
          );
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
