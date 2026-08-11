import { QuotationRenderDTO } from './QuotationRenderModelService';

export class QuotationPdfService {
  /**
   * Escape text for raw PDF stream literal strings
   */
  public static escapePdfText(text: string): string {
    if (!text) return '';
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[\r\n]+/g, ' ');
  }

  /**
   * Format currency numbers
   */
  public static formatAmount(amount: number, symbol: string = '₹'): string {
    const absVal = Math.abs(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const formatted = `${symbol}${absVal}`;
    return amount < 0 ? `-${formatted}` : formatted;
  }

  /**
   * Generate clean %PDF-1.4 binary document Buffer from QuotationRenderDTO
   */
  public static async generatePdf(renderModel: QuotationRenderDTO): Promise<Buffer> {
    const doc = renderModel.document;
    const cust = renderModel.customerSnapshot;
    const org = renderModel.organization;
    const totals = renderModel.totals;
    const tmpl = renderModel.template;
    const lines = renderModel.lineItems;

    // Calculate pages required (max 10 items per page for clean pagination)
    const itemsPerPage = 10;
    const totalPages = Math.max(1, Math.ceil(lines.length / itemsPerPage));

    const objects: string[] = [];
    const pageObjRefs: string[] = [];

    // Catalog & Pages placeholders (obj 1 and obj 2)
    objects[1] = ''; // Catalog
    objects[2] = ''; // Pages

    // Font object (Helvetica / Standard Type 1 Font)
    const fontObjId = 3;
    objects[fontObjId] = `${fontObjId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj`;

    const fontBoldObjId = 4;
    objects[fontBoldObjId] = `${fontBoldObjId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj`;

    let nextObjId = 5;

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const pageNum = pageIdx + 1;
      const startItemIdx = pageIdx * itemsPerPage;
      const pageItems = lines.slice(startItemIdx, startItemIdx + itemsPerPage);
      const isLastPage = pageNum === totalPages;

      const streamCommands: string[] = [];

      // Primary Color Box Header
      streamCommands.push(`0.12 0.25 0.69 rg 40 760 532 50 re f`);

      // Header Text (White)
      streamCommands.push(`BT /F2 18 Tf 1 1 1 rg 50 780 Tj ET`);
      streamCommands.push(`BT /F2 16 Tf 1 1 1 rg 420 780 Tj ET`);
      streamCommands.push(`(QUOTATION)`);

      // Document Number & Dates Right Aligned Box
      streamCommands.push(`BT /F1 9 Tf 0.2 0.2 0.2 rg 400 735 Tj (${this.escapePdfText(`Quote #: ${doc.quotationNumber}`)}) ET`);
      streamCommands.push(`BT /F1 9 Tf 0.2 0.2 0.2 rg 400 722 Tj (${this.escapePdfText(`Rev #: ${doc.revisionNumber}`)}) ET`);
      streamCommands.push(`BT /F1 9 Tf 0.2 0.2 0.2 rg 400 709 Tj (${this.escapePdfText(`Date: ${doc.issueDate}`)}) ET`);
      streamCommands.push(`BT /F1 9 Tf 0.2 0.2 0.2 rg 400 696 Tj (${this.escapePdfText(`Valid Until: ${doc.expiryDate}`)}) ET`);
      streamCommands.push(`BT /F1 9 Tf 0.2 0.2 0.2 rg 400 683 Tj (${this.escapePdfText(`Status: ${doc.status}`)}) ET`);

      // Company Identity Box Left
      streamCommands.push(`BT /F2 12 Tf 0.1 0.1 0.1 rg 40 735 Tj (${this.escapePdfText(org.legalName)}) ET`);
      streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 40 720 Tj (${this.escapePdfText(org.address)}) ET`);
      if (org.gstin) {
        streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 40 707 Tj (${this.escapePdfText(`GSTIN: ${org.gstin}`)}) ET`);
      }
      streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 40 694 Tj (${this.escapePdfText(`Email: ${org.email} | Phone: ${org.phone}`)}) ET`);

      // Divider Line
      streamCommands.push(`0.8 0.8 0.8 RG 0.5 w 40 670 m 572 670 l S`);

      // Customer Bill To Section
      streamCommands.push(`BT /F2 10 Tf 0.12 0.25 0.69 rg 40 655 Tj (BILL TO / CUSTOMER) ET`);
      streamCommands.push(`BT /F2 11 Tf 0.1 0.1 0.1 rg 40 640 Tj (${this.escapePdfText(cust.displayName)}) ET`);
      const street = cust.billingAddress?.street || '';
      const cityState = [cust.billingAddress?.city, cust.billingAddress?.state, cust.billingAddress?.pincode].filter(Boolean).join(', ');
      streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 40 627 Tj (${this.escapePdfText(`${street} ${cityState}`)}) ET`);
      if (cust.gstin) {
        streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 40 614 Tj (${this.escapePdfText(`GSTIN: ${cust.gstin}`)}) ET`);
      }

      // Items Table Header Box
      const tableTopY = 590;
      streamCommands.push(`0.92 0.94 0.98 rg 40 ${tableTopY - 20} 532 20 re f`);
      streamCommands.push(`0.7 0.7 0.7 RG 0.5 w 40 ${tableTopY - 20} 532 20 re S`);

      streamCommands.push(`BT /F2 9 Tf 0.1 0.1 0.1 rg 45 ${tableTopY - 14} Tj (#) ET`);
      streamCommands.push(`BT /F2 9 Tf 0.1 0.1 0.1 rg 70 ${tableTopY - 14} Tj (ITEM / DESCRIPTION) ET`);
      streamCommands.push(`BT /F2 9 Tf 0.1 0.1 0.1 rg 260 ${tableTopY - 14} Tj (HSN/SAC) ET`);
      streamCommands.push(`BT /F2 9 Tf 0.1 0.1 0.1 rg 320 ${tableTopY - 14} Tj (QTY) ET`);
      streamCommands.push(`BT /F2 9 Tf 0.1 0.1 0.1 rg 370 ${tableTopY - 14} Tj (RATE) ET`);
      streamCommands.push(`BT /F2 9 Tf 0.1 0.1 0.1 rg 440 ${tableTopY - 14} Tj (TAX %) ET`);
      streamCommands.push(`BT /F2 9 Tf 0.1 0.1 0.1 rg 500 ${tableTopY - 14} Tj (AMOUNT) ET`);

      let currentY = tableTopY - 35;
      for (const item of pageItems) {
        streamCommands.push(`BT /F1 9 Tf 0.2 0.2 0.2 rg 45 ${currentY} Tj (${item.lineNumber}) ET`);
        streamCommands.push(`BT /F2 9 Tf 0.1 0.1 0.1 rg 70 ${currentY} Tj (${this.escapePdfText(item.name.substring(0, 30))}) ET`);
        if (item.description && item.description !== item.name) {
          currentY -= 11;
          streamCommands.push(`BT /F1 8 Tf 0.4 0.4 0.4 rg 70 ${currentY} Tj (${this.escapePdfText(item.description.substring(0, 45))}) ET`);
        }
        streamCommands.push(`BT /F1 9 Tf 0.2 0.2 0.2 rg 260 ${currentY} Tj (${this.escapePdfText(item.hsnSac || '-')}) ET`);
        streamCommands.push(`BT /F1 9 Tf 0.2 0.2 0.2 rg 320 ${currentY} Tj (${item.quantity} ${this.escapePdfText(item.unit)}) ET`);
        streamCommands.push(`BT /F1 9 Tf 0.2 0.2 0.2 rg 370 ${currentY} Tj (${this.escapePdfText(this.formatAmount(item.rate, doc.currencySymbol))}) ET`);
        streamCommands.push(`BT /F1 9 Tf 0.2 0.2 0.2 rg 440 ${currentY} Tj (${item.taxRate}%) ET`);
        streamCommands.push(`BT /F1 9 Tf 0.2 0.2 0.2 rg 500 ${currentY} Tj (${this.escapePdfText(this.formatAmount(item.lineTotal, doc.currencySymbol))}) ET`);

        currentY -= 18;
        streamCommands.push(`0.9 0.9 0.9 RG 0.25 w 40 ${currentY + 6} m 572 ${currentY + 6} l S`);
      }

      // If last page, render Totals Breakdown Box
      if (isLastPage) {
        let totalsY = Math.max(160, currentY - 10);

        streamCommands.push(`0.96 0.96 0.98 rg 360 ${totalsY - 110} 212 110 re f`);
        streamCommands.push(`0.8 0.8 0.8 RG 0.5 w 360 ${totalsY - 110} 212 110 re S`);

        let ty = totalsY - 15;
        if (totals.lineDiscounts > 0) {
          streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 370 ${ty} Tj (Gross Amount:) ET`);
          streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 480 ${ty} Tj (${this.escapePdfText(this.formatAmount(totals.grossAmount, doc.currencySymbol))}) ET`);
          ty -= 13;
          streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 370 ${ty} Tj (Line Discounts:) ET`);
          streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 480 ${ty} Tj (-${this.escapePdfText(this.formatAmount(totals.lineDiscounts, doc.currencySymbol))}) ET`);
          ty -= 13;
        }

        streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 370 ${ty} Tj (Subtotal:) ET`);
        streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 480 ${ty} Tj (${this.escapePdfText(this.formatAmount(totals.subtotal, doc.currencySymbol))}) ET`);
        ty -= 13;

        if (totals.overallDiscount > 0) {
          streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 370 ${ty} Tj (Overall Discount:) ET`);
          streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 480 ${ty} Tj (-${this.escapePdfText(this.formatAmount(totals.overallDiscount, doc.currencySymbol))}) ET`);
          ty -= 13;
        }

        streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 370 ${ty} Tj (Taxable Amount:) ET`);
        streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 480 ${ty} Tj (${this.escapePdfText(this.formatAmount(totals.taxableAmount, doc.currencySymbol))}) ET`);
        ty -= 13;

        streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 370 ${ty} Tj (GST / Tax Total:) ET`);
        streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 480 ${ty} Tj (${this.escapePdfText(this.formatAmount(totals.taxTotal, doc.currencySymbol))}) ET`);
        ty -= 13;

        if (totals.roundOffAmount !== 0) {
          streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 370 ${ty} Tj (Round Off:) ET`);
          streamCommands.push(`BT /F1 9 Tf 0.3 0.3 0.3 rg 480 ${ty} Tj (${this.escapePdfText(this.formatAmount(totals.roundOffAmount, doc.currencySymbol))}) ET`);
          ty -= 13;
        }

        streamCommands.push(`0.12 0.25 0.69 RG 1 w 365 ${ty - 2} m 567 ${ty - 2} l S`);
        ty -= 12;
        streamCommands.push(`BT /F2 11 Tf 0.12 0.25 0.69 rg 370 ${ty} Tj (Grand Total:) ET`);
        streamCommands.push(`BT /F2 11 Tf 0.12 0.25 0.69 rg 480 ${ty} Tj (${this.escapePdfText(this.formatAmount(totals.grandTotal, doc.currencySymbol))}) ET`);

        // Notes & Terms Left Section
        let leftY = Math.max(140, totalsY - 15);
        if (doc.notes) {
          streamCommands.push(`BT /F2 9 Tf 0.12 0.25 0.69 rg 40 ${leftY} Tj (Notes:) ET`);
          leftY -= 12;
          streamCommands.push(`BT /F1 8 Tf 0.3 0.3 0.3 rg 40 ${leftY} Tj (${this.escapePdfText(doc.notes.substring(0, 60))}) ET`);
          leftY -= 15;
        }

        if (tmpl.termsAndConditions || doc.terms) {
          streamCommands.push(`BT /F2 9 Tf 0.12 0.25 0.69 rg 40 ${leftY} Tj (Terms & Conditions:) ET`);
          leftY -= 12;
          const termsStr = (doc.terms || tmpl.termsAndConditions || '').substring(0, 90);
          streamCommands.push(`BT /F1 8 Tf 0.3 0.3 0.3 rg 40 ${leftY} Tj (${this.escapePdfText(termsStr)}) ET`);
        }

        // Signature Block Right Bottom
        if (tmpl.showSignature) {
          streamCommands.push(`0.7 0.7 0.7 RG 0.5 w 400 65 m 550 65 l S`);
          streamCommands.push(`BT /F1 8 Tf 0.4 0.4 0.4 rg 430 52 Tj (Authorized Signatory) ET`);
        }
      }

      // Page Footer
      streamCommands.push(`0.8 0.8 0.8 RG 0.5 w 40 40 m 572 40 l S`);
      streamCommands.push(`BT /F1 8 Tf 0.5 0.5 0.5 rg 40 28 Tj (${this.escapePdfText(tmpl.footerNote || 'Thank you for your business!')}) ET`);
      streamCommands.push(`BT /F1 8 Tf 0.5 0.5 0.5 rg 500 28 Tj (Page ${pageNum} of ${totalPages}) ET`);

      const streamContent = streamCommands.join('\n');
      const streamLength = Buffer.byteLength(streamContent);

      const streamObjId = nextObjId++;
      objects[streamObjId] = `${streamObjId} 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj`;

      const pageObjId = nextObjId++;
      pageObjRefs.push(`${pageObjId} 0 R`);
      objects[pageObjId] = `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${streamObjId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R /F2 ${fontBoldObjId} 0 R >> >> >>\nendobj`;
    }

    // Update Pages and Catalog objects
    objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjRefs.join(' ')}] /Count ${totalPages} >>\nendobj`;
    objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`;

    // Construct final PDF Buffer stream
    let pdfString = '%PDF-1.4\n';
    const offsets: number[] = [0];

    for (let i = 1; i < objects.length; i++) {
      offsets[i] = Buffer.byteLength(pdfString);
      pdfString += objects[i] + '\n';
    }

    const xrefOffset = Buffer.byteLength(pdfString);
    pdfString += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;

    for (let i = 1; i < objects.length; i++) {
      const offsetStr = offsets[i].toString().padStart(10, '0');
      pdfString += `${offsetStr} 00000 n \n`;
    }

    pdfString += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdfString, 'binary');
  }
}
