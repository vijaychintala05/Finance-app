import PDFDocument from 'pdfkit';
import { type DbQueryClient } from '../database/db';
import { amountToWords } from '../utils/numberToWords';
import { DocumentTemplateService } from './DocumentTemplateService';

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

    // Legacy downloads still honor the organization's versioned expense template.
    const template = await DocumentTemplateService.resolve(client, organizationId, 'expenses');
    const templateConfig = template?.configuration || {};
    const primaryColor = /^#[0-9a-fA-F]{6}$/.test(templateConfig.primaryColor || '')
      ? templateConfig.primaryColor : '#0284c7';
    const accentColor = /^#[0-9a-fA-F]{6}$/.test(templateConfig.accentColor || '')
      ? templateConfig.accentColor : '#0f172a';
    const fontFamily = ['Helvetica', 'Courier', 'Times-Roman'].includes(templateConfig.fontFamily)
      ? templateConfig.fontFamily : 'Helvetica';
    const boldFont = fontFamily === 'Times-Roman' ? 'Times-Bold' : `${fontFamily}-Bold`;
    const italicFont = fontFamily === 'Times-Roman' ? 'Times-Italic' : `${fontFamily}-Oblique`;
    const variant = template?.modelId || 'reimbursement';
    const variantLabel = variant === 'petty-cash' ? 'PETTY CASH VOUCHER'
      : variant === 'project-billable' ? 'PROJECT COST RECOVERY' : 'EXPENSE VOUCHER';
    const paperSize = ['A3', 'A4', 'A5', 'Letter', 'Legal'].includes(String(templateConfig.paperSize || template?.paperSize))
      ? String(templateConfig.paperSize || template?.paperSize) : 'A4';
    const orientation = ['portrait', 'landscape'].includes(String(templateConfig.orientation || template?.orientation))
      ? String(templateConfig.orientation || template?.orientation) as 'portrait' | 'landscape' : 'portrait';
    const show = (key: string) => templateConfig[key] !== false;

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

    // The voucher must mirror the immutable ledger, rather than recreate a
    // simplified version of the posting from the expense form.
    const journalRes = exp.journal_entry_id
      ? await client.query(
          `SELECT je.entry_number, je.date, jl.id, jl.account_code, jl.account_name,
                  jl.description, jl.debit, jl.credit
             FROM journal_entries je
             JOIN journal_lines jl ON jl.journal_entry_id = je.id
            WHERE je.organization_id = $1 AND je.id = $2
            ORDER BY jl.id ASC`,
          [organizationId, exp.journal_entry_id]
        )
      : { rows: [] as any[] };
    const postedLines = journalRes.rows.map((line: any) => ({
      id: String(line.id),
      accountName: String(line.account_name || line.account_code || 'Ledger account'),
      description: String(line.description || exp.description || 'Expense posting'),
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
    }));

    // 5. Fetch Attached Receipt Images
    const receiptsRes = await client.query(
      `SELECT id, file_name, mime_type, byte_size, content_base64
         FROM expense_receipt_attachments
        WHERE organization_id = $1 AND expense_id = $2
        ORDER BY created_at ASC`,
      [organizationId, expenseId]
    );
    const receipts = receiptsRes.rows;

    const amount = Number(exp.amount || 0);
    const taxAmount = Number(exp.tax_amount || 0);
    const totalAmount = postedLines.length
      ? postedLines.reduce((total, line) => total + line.credit, 0)
      : (Boolean(exp.is_tax_inclusive) ? amount : amount + taxAmount);
    const words = amountToWords(totalAmount, currencySymbol);
    const voucherNumber = exp.expense_number || `EXP-${exp.id.slice(0, 8).toUpperCase()}`;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margins: { top: 32, bottom: 0, left: 32, right: 32 }, size: paperSize, layout: orientation, bufferPages: true });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const margin = 32;
        const pageWidth = () => doc.page.width;
        const pageHeight = () => doc.page.height;
        const contentWidth = () => pageWidth() - margin * 2;
        const fontRegular = fontFamily;
        const fontBold = boldFont;
        const rightEdge = () => pageWidth() - margin;
        const contentBottom = () => pageHeight() - 48;
        const topRule = () => doc.rect(margin, 26, contentWidth(), 3).fill(primaryColor);

        // --- PAGE 1: EXPENSE PAYMENT VOUCHER ---
        topRule();

        // Header Title & Voucher Number
        const headerCentered = templateConfig.headerLayout === 'centered';
        const headingWidth = contentWidth();
        let headerY = 38;
        const headerText = (value: string, size: number, font: string, color: string) => {
          doc.fontSize(size).font(font).fillColor(color);
          const height = doc.heightOfString(value, { width: headingWidth });
          doc.text(value, margin, headerY, { width: headingWidth, align: headerCentered ? 'center' : 'left' });
          headerY += height + 4;
        };
        headerText('EXPENSE PAYMENT VOUCHER', 18, fontBold, primaryColor);
        headerText(variantLabel, 7.5, fontBold, accentColor);
        if (templateConfig.templateTitle && templateConfig.templateTitle !== 'EXPENSE VOUCHER') {
          headerText(templateConfig.templateTitle, 8, fontRegular, accentColor);
        }
        doc.fontSize(11).font(fontBold).fillColor(accentColor);
        const referenceHeight = doc.heightOfString(voucherNumber, { width: contentWidth() * 0.7 });
        doc.text(voucherNumber, margin, headerY, { width: contentWidth() * 0.7 });

        // Status Badge
        const statusText = (exp.status || 'POSTED').toUpperCase();
        const badgeWidth = Math.min(88, contentWidth() * 0.22);
        const badgeHeight = Math.max(16, doc.fontSize(7.5).font(fontBold).heightOfString(statusText, { width: badgeWidth }) + 8);
        doc.roundedRect(rightEdge() - badgeWidth, headerY, badgeWidth, badgeHeight, 3).fillAndStroke('#f1f5f9', '#cbd5e1');
        doc.fontSize(7.5).font(fontBold).fillColor('#0369a1').text(statusText, rightEdge() - badgeWidth, headerY + 4, { width: badgeWidth, align: 'center' });

        let curY = headerY + Math.max(referenceHeight, badgeHeight) + 8;

        // Organization Info (Left)
        const colWidth = contentWidth() * 0.49;
        const organizationStartY = curY;
        doc.fontSize(11).font(fontBold).fillColor('#0f172a').text(org.name || 'Organization', margin, curY, { width: colWidth });
        curY += doc.heightOfString(org.name || 'Organization', { width: colWidth }) + 2;

        const orgAddress = [org.address, org.city, org.state, org.country, org.zip_code].filter(Boolean).join(', ');
        if (orgAddress) {
          doc.fontSize(8.5).font(fontRegular).fillColor('#475569').text(orgAddress, margin, curY, { width: colWidth });
          curY += doc.heightOfString(orgAddress, { width: colWidth }) + 2;
        }
        if (org.tax_id || org.gstin) {
          doc.fontSize(8.5).font(fontRegular).fillColor('#475569').text(`GSTIN / Tax ID: ${org.tax_id || org.gstin}`, margin, curY, { width: colWidth });
          curY += doc.heightOfString(`GSTIN / Tax ID: ${org.tax_id || org.gstin}`, { width: colWidth }) + 2;
        }

        // Voucher Metadata (Right)
        let rightY = organizationStartY;
        doc.fontSize(8.5).font(fontRegular).fillColor('#334155');
        const rightX = margin + contentWidth() - colWidth;
        doc.text(`Voucher Date: ${exp.date || new Date().toISOString().split('T')[0]}`, rightX, rightY, { width: colWidth, align: 'right' });
        rightY += doc.heightOfString(`Voucher Date: ${exp.date || new Date().toISOString().split('T')[0]}`, { width: colWidth }) + 2;
        doc.text(`Payment Method: ${exp.payment_method || 'Bank / Cash'}`, rightX, rightY, { width: colWidth, align: 'right' });
        rightY += doc.heightOfString(`Payment Method: ${exp.payment_method || 'Bank / Cash'}`, { width: colWidth }) + 2;
        if (exp.vendor_invoice_number) {
          doc.text(`Vendor ref: ${exp.vendor_invoice_number}`, rightX, rightY, { width: colWidth, align: 'right' });
          rightY += doc.heightOfString(`Vendor ref: ${exp.vendor_invoice_number}`, { width: colWidth }) + 2;
        }
        if (exp.project_id) {
          doc.text(`Project Ref: ${exp.project_id}`, rightX, rightY, { width: colWidth, align: 'right' });
          rightY += doc.heightOfString(`Project Ref: ${exp.project_id}`, { width: colWidth }) + 2;
        }

        curY = Math.max(curY, rightY + 8);

        // Divider
        doc.moveTo(margin, curY).lineTo(rightEdge(), curY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        curY += 5;

        // --- DISBURSEMENT & BENEFICIARY CARD ---
        let cardY = curY;
        const payee = exp.vendor_name || 'Not specified';
        const payeeWidth = contentWidth() * 0.42;
        const payeeHeight = doc.fontSize(9).font(fontBold).heightOfString(payee, { width: payeeWidth });
        const categoryOffset = 34 + payeeHeight + 3;
        const categoryHeight = show('showExpenseCategory')
          ? doc.fontSize(7).font(fontRegular).heightOfString(`Category: ${expenseAccountName}`, { width: contentWidth() * 0.42 })
          : 0;
        const recoveryOffset = categoryOffset + categoryHeight + 3;
        const recoveryText = `RECOVERY ${exp.is_billable ? 'BILLABLE' : 'NON-BILLABLE'}  |  Client charge: ${this.formatAmount(Number(exp.selling_price || 0), currencySymbol)}`;
        const recoveryHeight = variant === 'project-billable' ? doc.fontSize(7).font(fontBold).heightOfString(recoveryText, { width: contentWidth() * 0.46 }) : 0;
        const fundingHeight = doc.fontSize(8.5).font(fontRegular).heightOfString(paidFromAccountName, { width: contentWidth() * 0.45 });
        const claimantOffset = 34 + fundingHeight + 3;
        const claimantText = 'Claimant: Not specified';
        const claimantHeight = show('showClaimantName') ? doc.fontSize(7).font(fontRegular).heightOfString(claimantText, { width: contentWidth() * 0.45 }) : 0;
        const cardHeight = Math.max(
          60,
          34 + payeeHeight + 5,
          claimantOffset + claimantHeight + 5,
          show('showExpenseCategory') ? categoryOffset + categoryHeight + 5 : 0,
          variant === 'project-billable' ? recoveryOffset + recoveryHeight + 5 : 0,
        );
        if (cardY + cardHeight > contentBottom()) {
          doc.addPage();
          topRule();
          cardY = 40;
        }
        doc.roundedRect(margin, cardY, contentWidth(), cardHeight, 4).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.fontSize(8).font(fontBold).fillColor(primaryColor).text('DISBURSEMENT & BENEFICIARY DETAILS', margin + 10, cardY + 7);

        // Left Column: Payee / Vendor
        doc.fontSize(7.5).font(fontBold).fillColor('#64748b').text('PAID TO / VENDOR:', margin + 10, cardY + 22);
        doc.fontSize(9).font(fontBold).fillColor('#0f172a').text(payee, margin + 10, cardY + 34, { width: payeeWidth });

        // Right Column: Disbursed From & Classification
        const classificationX = margin + contentWidth() * 0.52;
        doc.fontSize(7.5).font(fontBold).fillColor('#64748b').text('DISBURSED FROM ACCOUNT:', classificationX, cardY + 22);
        doc.fontSize(8.5).font(fontRegular).fillColor('#334155').text(paidFromAccountName, classificationX, cardY + 34, { width: contentWidth() * 0.45 });
        if (show('showClaimantName')) doc.fontSize(7).font(fontRegular).fillColor('#64748b').text(claimantText, classificationX, cardY + claimantOffset, { width: contentWidth() * 0.45 });
        if (variant === 'project-billable') {
          doc.fontSize(7).font(fontBold).fillColor(primaryColor).text(recoveryText, margin + 10, cardY + recoveryOffset, { width: contentWidth() * 0.46 });
        }
        if (show('showExpenseCategory')) doc.fontSize(7).font(fontRegular).fillColor('#64748b').text(`Category: ${expenseAccountName}`, margin + 10, cardY + categoryOffset, { width: contentWidth() * 0.42 });

        curY = cardY + cardHeight + 2;

        // --- ACCOUNTING ALLOCATION TABLE ---
        const showAllocation = show('showAccountAllocation') && show('showDoubleEntry');
        const tableWidth = contentWidth();
        const indexX = margin + 5;
        const accountX = margin + 28;
        const accountWidth = tableWidth * 0.34;
        const memoX = accountX + accountWidth + 5;
        const memoWidth = tableWidth * 0.29;
        const debitX = memoX + memoWidth;
        const moneyWidth = (rightEdge() - debitX) / 2;
        const tableStartY = curY;
        const drawTableHeader = () => {
          const y = curY;
          doc.roundedRect(margin, y, tableWidth, 20, 3).fill(primaryColor);
          doc.fillColor('#ffffff').fontSize(8).font(fontBold);
          doc.text('#', indexX, y + 6, { width: 20 });
          doc.text('ACCOUNT / CATEGORY', accountX, y + 6, { width: accountWidth });
          doc.text('MEMO / DESCRIPTION', memoX, y + 6, { width: memoWidth });
          doc.text('DEBIT', debitX, y + 6, { width: moneyWidth - 3, align: 'right' });
          doc.text('CREDIT', debitX + moneyWidth, y + 6, { width: moneyWidth - 3, align: 'right' });
          curY = y + 21;
        };
        const splitCellText = (value: string, width: number, size: number, font: string, maxHeight: number) => {
          const wordsToPlace = value.split(/\s+/).filter(Boolean);
          const pages: string[] = [];
          let part = '';
          for (const word of wordsToPlace) {
            const candidate = part ? `${part} ${word}` : word;
            if (part && doc.fontSize(size).font(font).heightOfString(candidate, { width }) > maxHeight) {
              pages.push(part);
              part = word;
            } else {
              part = candidate;
            }
          }
          if (part || pages.length === 0) pages.push(part);
          return pages;
        };
        if (showAllocation) {
        drawTableHeader();

        const voucherLines = postedLines.length ? postedLines : [
          { id: 'expense', accountName: expenseAccountName, description: exp.description || 'Expense distribution', debit: amount, credit: 0 },
          { id: 'payment', accountName: paidFromAccountName, description: 'Payment disbursement', debit: 0, credit: totalAmount },
        ];
        for (let index = 0; index < voucherLines.length; index++) {
          const line = voucherLines[index];
          const accountHeight = doc.fontSize(8).font(fontBold).heightOfString(line.accountName, { width: accountWidth });
          const memoHeight = doc.fontSize(7.5).font(fontRegular).heightOfString(line.description, { width: memoWidth });
          const rowHeight = Math.max(14, accountHeight, memoHeight) + 4;
          const maxRowTextHeight = contentBottom() - 40 - 21 - 4;
          if (Math.max(accountHeight, memoHeight) > maxRowTextHeight) {
            const accountParts = splitCellText(line.accountName, accountWidth, 8, fontBold, maxRowTextHeight);
            const memoParts = splitCellText(line.description, memoWidth, 7.5, fontRegular, maxRowTextHeight);
            const partCount = Math.max(accountParts.length, memoParts.length);
            for (let part = 0; part < partCount; part++) {
              const accountPart = accountParts[part] || '';
              const memoPart = memoParts[part] || '';
              const partHeight = Math.max(
                accountPart ? doc.fontSize(8).font(fontBold).heightOfString(accountPart, { width: accountWidth }) : 0,
                memoPart ? doc.fontSize(7.5).font(fontRegular).heightOfString(memoPart, { width: memoWidth }) : 0,
                14,
              ) + 4;
              if (curY + partHeight > contentBottom()) {
                doc.addPage();
                topRule();
                curY = 40;
                drawTableHeader();
              }
              if (part === 0) {
                doc.fontSize(8).font(fontRegular).fillColor('#475569').text(String(index + 1), indexX, curY);
                doc.fontSize(8).font(fontRegular).fillColor('#0f172a').text(line.debit ? this.formatAmount(line.debit, currencySymbol) : '-', debitX, curY, { width: moneyWidth - 3, align: 'right' });
                doc.text(line.credit ? this.formatAmount(line.credit, currencySymbol) : '-', debitX + moneyWidth, curY, { width: moneyWidth - 3, align: 'right' });
              }
              if (accountPart) doc.fontSize(8).font(fontBold).fillColor('#0f172a').text(accountPart, accountX, curY, { width: accountWidth });
              if (memoPart) doc.fontSize(7.5).font(fontRegular).fillColor('#475569').text(memoPart, memoX, curY, { width: memoWidth });
              curY += partHeight;
              doc.moveTo(margin, curY - 2).lineTo(rightEdge(), curY - 2).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            }
            continue;
          }
          if (curY + rowHeight > contentBottom()) {
            doc.addPage();
            topRule();
            curY = 40;
            drawTableHeader();
          }
          doc.fontSize(8).font(fontRegular).fillColor('#475569').text(String(index + 1), indexX, curY);
          doc.fontSize(8).font(fontBold).fillColor('#0f172a').text(line.accountName, accountX, curY, { width: accountWidth });
          doc.fontSize(7.5).font(fontRegular).fillColor('#475569').text(line.description, memoX, curY, { width: memoWidth });
          doc.fontSize(8).font(fontRegular).fillColor('#0f172a').text(line.debit ? this.formatAmount(line.debit, currencySymbol) : '-', debitX, curY, { width: moneyWidth - 3, align: 'right' });
          doc.text(line.credit ? this.formatAmount(line.credit, currencySymbol) : '-', debitX + moneyWidth, curY, { width: moneyWidth - 3, align: 'right' });
          curY += rowHeight;
          doc.moveTo(margin, curY - 2).lineTo(rightEdge(), curY - 2).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        }
        doc.moveTo(margin, curY - 2).lineTo(rightEdge(), curY - 2).strokeColor('#cbd5e1').lineWidth(0.75).stroke();
        } else {
          curY = tableStartY;
        }

        // Keep totals, amount in words, and both audit boxes together.
        const measuredWordsHeight = show('showAmountInWords')
          ? doc.fontSize(8.5).font(fontBold).heightOfString(words, { width: contentWidth() - 20 }) + 24
          : 0;
        const wordBoxHeight = show('showAmountInWords') ? Math.max(34, measuredWordsHeight) : 0;
        const totalsWidth = contentWidth() * 0.48;
        const expenseTotalText = `Expense amount: ${this.formatAmount(amount, currencySymbol)}`;
        const postingTotalText = `Posting total: ${this.formatAmount(totalAmount, currencySymbol)}`;
        const expenseTotalHeight = doc.fontSize(9).font(fontBold).heightOfString(expenseTotalText, { width: totalsWidth });
        const postingTotalHeight = doc.fontSize(10).font(fontBold).heightOfString(postingTotalText, { width: totalsWidth });
        const halfWidth = (contentWidth() - 12) / 2;
        const auditTextWidth = halfWidth - 16;
        const recorder = exp.created_by || 'Not specified';
        const recordedDate = `Date: ${exp.date || new Date().toISOString().split('T')[0]}`;
        const postingReference = `Expense reference: ${voucherNumber}`;
        const reimbursement = show('showReimbursementStatus') ? `Reimbursement: ${exp.reimbursement_status || 'Not specified'}` : 'Posting details omitted';
        const recorderHeight = doc.fontSize(8.5).font(fontRegular).heightOfString(recorder, { width: auditTextWidth });
        const referenceHeightInAudit = doc.heightOfString(postingReference, { width: auditTextWidth });
        const recordedDateHeight = doc.fontSize(7.5).font(fontRegular).heightOfString(recordedDate, { width: auditTextWidth });
        const reimbursementHeight = doc.heightOfString(reimbursement, { width: auditTextWidth });
        const auditMinimum = template?.layoutFamily === 'compact' && paperSize === 'A5' && orientation === 'landscape' ? 60 : 65;
        const auditHeight = Math.max(auditMinimum, 22 + recorderHeight + 4 + recordedDateHeight + 8, 22 + referenceHeightInAudit + 4 + reimbursementHeight + 8);
        const trailingHeight = 6 + expenseTotalHeight + 3 + postingTotalHeight + 8 + wordBoxHeight + (show('showAmountInWords') ? 12 : 0) + auditHeight;
        if (curY + trailingHeight > contentBottom()) {
          doc.addPage();
          topRule();
          curY = 40;
        }

        // Totals Box
        curY += 6;
        doc.fontSize(9).font(fontBold).fillColor('#475569');
        doc.text(expenseTotalText, rightEdge() - totalsWidth, curY, { width: totalsWidth, align: 'right' });
        curY += expenseTotalHeight + 3;
        doc.fontSize(10).font(fontBold).fillColor('#0f172a');
        doc.text(postingTotalText, rightEdge() - totalsWidth, curY, { width: totalsWidth, align: 'right' });

        // Amount in Words Box
        curY += postingTotalHeight + 8;
        if (show('showAmountInWords')) {
        doc.roundedRect(margin, curY, contentWidth(), wordBoxHeight, 4).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.fontSize(7.5).font(fontBold).fillColor('#64748b').text('Amount in Words:', margin + 10, curY + 6);
        doc.fontSize(8.5).font(fontBold).fillColor('#0f172a').text(words, margin + 10, curY + 18, { width: contentWidth() - 20 });
        }

        if (show('showAmountInWords')) curY += wordBoxHeight + 12;

        // Audit and approval are separate workflows. Do not claim approval if none exists.
        doc.roundedRect(margin, curY, halfWidth, auditHeight, 3).strokeColor('#e2e8f0').stroke();
        doc.fontSize(7.5).font(fontBold).fillColor('#64748b').text('RECORDED DOCUMENT', margin + 8, curY + 8);
        doc.fontSize(8.5).font(fontRegular).fillColor('#334155').text(recorder, margin + 8, curY + 22, { width: auditTextWidth });
        doc.fontSize(7.5).font(fontRegular).fillColor('#94a3b8').text(recordedDate, margin + 8, curY + 22 + recorderHeight + 4, { width: auditTextWidth });

        doc.roundedRect(margin + halfWidth + 12, curY, halfWidth, auditHeight, 3).strokeColor('#e2e8f0').stroke();
        doc.fontSize(7.5).font(fontBold).fillColor('#64748b').text('POSTING TRACE', margin + halfWidth + 20, curY + 8);
        doc.fontSize(8.5).font(fontRegular).fillColor('#334155').text(postingReference, margin + halfWidth + 20, curY + 22, { width: auditTextWidth });
        doc.fontSize(7.5).font(fontRegular).fillColor('#94a3b8').text(reimbursement, margin + halfWidth + 20, curY + 22 + referenceHeightInAudit + 4, { width: auditTextWidth });

        // --- PAGE 2+: RECEIPT ATTACHMENTS DOSSIER ---
        if (receipts.length > 0 && show('showReceiptsAttached')) {
          doc.addPage();
          topRule();
          const annexureTitle = 'ANNEXURE: ATTACHED DIGITAL RECEIPTS';
          doc.fontSize(14).font(fontBold).fillColor(primaryColor).text(annexureTitle, margin, 40, { width: contentWidth() });
          const captionY = 40 + doc.heightOfString(annexureTitle, { width: contentWidth() }) + 5;
          const caption = `Supporting documentation dossier for Voucher #${voucherNumber} (${receipts.length} attachment${receipts.length === 1 ? '' : 's'})`;
          doc.fontSize(8.5).font(fontRegular).fillColor('#64748b').text(caption, margin, captionY, { width: contentWidth() });
          let receiptY = captionY + doc.heightOfString(caption, { width: contentWidth() }) + 8;

          for (let i = 0; i < receipts.length; i++) {
            const r = receipts[i];
            const imageHeight = Math.min(260, (pageHeight() - 110) * 0.42);
            const receiptTitle = `Receipt ${i + 1}: ${r.file_name}`;
            const receiptType = `${r.mime_type} | ${Math.round(r.byte_size / 1024)} KB`;
            const receiptHeaderHeight = Math.max(25,
              doc.fontSize(8.5).font(fontBold).heightOfString(receiptTitle, { width: contentWidth() * 0.65 }) + 14,
              doc.fontSize(7.5).font(fontRegular).heightOfString(receiptType, { width: contentWidth() * 0.32 }) + 16,
            );
            if (receiptY + receiptHeaderHeight + 7 + imageHeight > pageHeight() - 48) {
              doc.addPage();
              topRule();
              receiptY = 40;
            }

            // Receipt Box
            doc.roundedRect(margin, receiptY, contentWidth(), receiptHeaderHeight, 3).fillAndStroke('#f1f5f9', '#cbd5e1');
            doc.fontSize(8.5).font(fontBold).fillColor('#0f172a').text(receiptTitle, margin + 10, receiptY + 7, { width: contentWidth() * 0.65 });
            doc.fontSize(7.5).font(fontRegular).fillColor('#64748b').text(receiptType, margin + contentWidth() * 0.66, receiptY + 8, { width: contentWidth() * 0.32, align: 'right' });

            receiptY += receiptHeaderHeight + 7;

            if (r.content_base64) {
              try {
                const imgBuf = Buffer.from(r.content_base64, 'base64');
                doc.image(imgBuf, margin, receiptY, {
                  fit: [contentWidth(), imageHeight],
                  align: 'center',
                  valign: 'center',
                });
                receiptY += imageHeight + 15;
              } catch {
                doc.fontSize(8).font(italicFont).fillColor('#94a3b8').text('[Receipt image preview could not be rendered]', margin + 10, receiptY + 10);
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
          doc.fontSize(7).font(fontRegular).fillColor('#94a3b8').text(
            `FirmBooks | Expense payment voucher | Page ${i + 1} of ${pageRange.count}`,
            margin,
            pageHeight() - 42,
            { align: 'center', width: contentWidth() }
          );
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
