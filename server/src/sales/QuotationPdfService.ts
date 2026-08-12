import PDFDocument from 'pdfkit';
import { QuotationRenderDTO } from './QuotationRenderModelService';

export class QuotationPdfService {
  /**
   * Safe text encoder to sanitize string operands
   */
  public static sanitizeText(text: string | undefined | null): string {
    if (!text) return '';
    return text.toString().replace(/[\r\n]+/g, ' ').trim();
  }

  /**
   * Format currency numbers safely (e.g. ₹ 10,000.00 / INR 10,000.00 / Rs. 10,000.00)
   */
  public static formatAmount(amount: number, symbol: string): string {
    const absVal = Math.abs(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    if (!symbol) throw new Error('A verified currency symbol or ISO code is required');
    const prefix = symbol;
    const formatted = `${prefix} ${absVal}`;
    return amount < 0 ? `-${formatted}` : formatted;
  }

  /**
   * Generate clean, production-grade PDF document Buffer using PDFKit
   */
  public static async generatePdf(renderModel: QuotationRenderDTO): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const docData = renderModel.document;
        const cust = renderModel.customerSnapshot;
        const org = renderModel.organization;
        const totals = renderModel.totals;
        const tmpl = renderModel.template;
        const lines = renderModel.lineItems;

        const primaryColor = tmpl.primaryColor || '#1e40af';

        // --- HEADER SECTION ---
        doc.rect(40, 40, 515, 45).fill(primaryColor);

        doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text('QUOTATION', 50, 54, { width: 250 });
        doc.fontSize(12).font('Helvetica-Bold').text(docData.quotationNumber, 340, 56, { width: 205, align: 'right' });

        let curY = 95;

        // Organization Info (Left)
        if (org.legalName) {
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text(org.legalName, 40, curY, { width: 260 });
          curY += 14;
        }
        if (org.address) {
          doc.fontSize(9).font('Helvetica').fillColor('#475569').text(org.address, 40, curY, { width: 260 });
          curY += doc.heightOfString(org.address, { width: 260 }) + 2;
        }
        if (org.gstin) {
          doc.fontSize(9).font('Helvetica').fillColor('#475569').text(`GSTIN: ${org.gstin}`, 40, curY, { width: 260 });
          curY += 12;
        }
        const contactParts = [org.email ? `Email: ${org.email}` : '', org.phone ? `Phone: ${org.phone}` : ''].filter(Boolean).join(' | ');
        if (contactParts) {
          doc.fontSize(9).font('Helvetica').fillColor('#475569').text(contactParts, 40, curY, { width: 260 });
          curY += 14;
        }

        // Document Metadata (Right)
        let rightY = 95;
        doc.fontSize(9).font('Helvetica').fillColor('#334155');
        doc.text(`Quote #: ${docData.quotationNumber}`, 320, rightY, { width: 235, align: 'right' });
        rightY += 13;
        doc.text(`Revision #: ${docData.revisionNumber}`, 320, rightY, { width: 235, align: 'right' });
        rightY += 13;
        doc.text(`Date: ${docData.issueDate}`, 320, rightY, { width: 235, align: 'right' });
        rightY += 13;
        doc.text(`Valid Until: ${docData.expiryDate}`, 320, rightY, { width: 235, align: 'right' });
        rightY += 13;
        doc.text(`Status: ${docData.status}`, 320, rightY, { width: 235, align: 'right' });

        curY = Math.max(curY, rightY + 10);

        // Divider Line
        doc.moveTo(40, curY).lineTo(555, curY).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
        curY += 10;

        // --- BILL TO / CUSTOMER SECTION ---
        doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor).text('BILL TO / CUSTOMER', 40, curY);
        curY += 14;

        if (cust.displayName) {
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text(cust.displayName, 40, curY);
          curY += 14;
        }

        let addrStr = '';
        if (cust.billingAddress) {
          const b = cust.billingAddress;
          addrStr = [b.street, b.city, b.state, b.pincode, b.country].filter(Boolean).join(', ');
        }
        if (addrStr) {
          doc.fontSize(9).font('Helvetica').fillColor('#475569').text(addrStr, 40, curY, { width: 350 });
          curY += doc.heightOfString(addrStr, { width: 350 }) + 3;
        }

        if (cust.gstin) {
          doc.fontSize(9).font('Helvetica').fillColor('#475569').text(`GSTIN: ${cust.gstin}`, 40, curY);
          curY += 13;
        }

        if (docData.projectId) {
          doc.fontSize(9).font('Helvetica').fillColor('#475569').text(`Project: ${docData.projectId}`, 40, curY);
          curY += 13;
        }

        curY += 10;

        // --- LINE ITEMS TABLE ---
        const drawTableHeader = (y: number) => {
          doc.rect(40, y, 515, 20).fill(primaryColor);
          doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
          doc.text('#', 45, y + 5, { width: 20 });
          doc.text('ITEM / DESCRIPTION', 70, y + 5, { width: 195 });
          doc.text('HSN/SAC', 270, y + 5, { width: 55, align: 'center' });
          doc.text('QTY', 330, y + 5, { width: 45, align: 'right' });
          doc.text('RATE', 380, y + 5, { width: 65, align: 'right' });
          doc.text('TAX %', 450, y + 5, { width: 40, align: 'right' });
          doc.text('AMOUNT', 495, y + 5, { width: 55, align: 'right' });
        };

        drawTableHeader(curY);
        curY += 24;

        if (docData.isGstInclusive) {
          doc.fontSize(8).font('Helvetica-Oblique').fillColor('#64748b').text('* Rates are inclusive of GST', 40, curY);
          curY += 12;
        }

        for (const item of lines) {
          const itemTitle = item.name;
          const itemDesc = item.description && item.description !== item.name ? item.description : '';

          const nameHeight = doc.heightOfString(itemTitle, { width: 195 });
          const descHeight = itemDesc ? doc.heightOfString(itemDesc, { width: 195 }) : 0;
          const rowHeight = Math.max(18, nameHeight + descHeight + 6);

          // Dynamic page break check (printable area max Y ~700)
          if (curY + rowHeight > 700) {
            doc.addPage();
            curY = 40;
            drawTableHeader(curY);
            curY += 24;
          }

          doc.fontSize(9).font('Helvetica').fillColor('#334155');
          doc.text(String(item.lineNumber), 45, curY, { width: 20 });

          doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a').text(itemTitle, 70, curY, { width: 195 });
          if (itemDesc) {
            doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(itemDesc, 70, curY + nameHeight + 1, { width: 195 });
          }

          doc.fontSize(9).font('Helvetica').fillColor('#334155');
          doc.text(item.hsnSac || '-', 270, curY, { width: 55, align: 'center' });
          doc.text(`${item.quantity} ${item.unit || ''}`, 330, curY, { width: 45, align: 'right' });
          doc.text(this.formatAmount(item.rate, docData.currencySymbol), 380, curY, { width: 65, align: 'right' });
          doc.text(`${item.taxRate}%`, 450, curY, { width: 40, align: 'right' });
          doc.text(this.formatAmount(item.lineTotal, docData.currencySymbol), 495, curY, { width: 55, align: 'right' });

          curY += rowHeight;
          doc.moveTo(40, curY - 2).lineTo(555, curY - 2).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        }

        curY += 10;

        // --- TOTALS BREAKDOWN SECTION ---
        if (curY + 130 > 700) {
          doc.addPage();
          curY = 40;
        }

        const totalsY = curY;
        const boxX = 330;
        const boxWidth = 225;

        let ty = totalsY + 8;
        doc.rect(boxX, totalsY, boxWidth, 125).fillAndStroke('#f8fafc', '#cbd5e1');

        if (totals.lineDiscounts > 0) {
          doc.fontSize(9).font('Helvetica').fillColor('#475569').text('Gross Amount:', boxX + 10, ty);
          doc.text(this.formatAmount(totals.grossAmount, docData.currencySymbol), boxX + 90, ty, { width: 125, align: 'right' });
          ty += 13;
          doc.text('Line Discounts:', boxX + 10, ty);
          doc.text(`-${this.formatAmount(totals.lineDiscounts, docData.currencySymbol)}`, boxX + 90, ty, { width: 125, align: 'right' });
          ty += 13;
        }

        doc.fontSize(9).font('Helvetica').fillColor('#475569').text('Subtotal:', boxX + 10, ty);
        doc.text(this.formatAmount(totals.subtotal, docData.currencySymbol), boxX + 90, ty, { width: 125, align: 'right' });
        ty += 13;

        if (totals.overallDiscount > 0) {
          doc.text('Overall Discount:', boxX + 10, ty);
          doc.text(`-${this.formatAmount(totals.overallDiscount, docData.currencySymbol)}`, boxX + 90, ty, { width: 125, align: 'right' });
          ty += 13;
        }

        doc.text('Taxable Amount:', boxX + 10, ty);
        doc.text(this.formatAmount(totals.taxableAmount, docData.currencySymbol), boxX + 90, ty, { width: 125, align: 'right' });
        ty += 13;

        doc.text('GST / Tax Total:', boxX + 10, ty);
        doc.text(this.formatAmount(totals.taxTotal, docData.currencySymbol), boxX + 90, ty, { width: 125, align: 'right' });
        ty += 13;

        if (totals.roundOffAmount !== 0) {
          doc.text('Round Off:', boxX + 10, ty);
          doc.text(this.formatAmount(totals.roundOffAmount, docData.currencySymbol), boxX + 90, ty, { width: 125, align: 'right' });
          ty += 13;
        }

        doc.moveTo(boxX + 10, ty).lineTo(boxX + 215, ty).strokeColor(primaryColor).lineWidth(1).stroke();
        ty += 6;

        doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor).text('Grand Total:', boxX + 10, ty);
        doc.text(this.formatAmount(totals.grandTotal, docData.currencySymbol), boxX + 90, ty, { width: 125, align: 'right' });

        // Left Section: Notes, Terms & Bank Details
        let leftY = totalsY;
        if (docData.notes) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor).text('Notes:', 40, leftY);
          leftY += 12;
          doc.fontSize(8).font('Helvetica').fillColor('#334155').text(docData.notes, 40, leftY, { width: 270 });
          leftY += doc.heightOfString(docData.notes, { width: 270 }) + 8;
        }

        const termsStr = docData.terms || tmpl.termsAndConditions;
        if (termsStr) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor).text('Terms & Conditions:', 40, leftY);
          leftY += 12;
          doc.fontSize(8).font('Helvetica').fillColor('#334155').text(termsStr, 40, leftY, { width: 270 });
          leftY += doc.heightOfString(termsStr, { width: 270 }) + 8;
        }

        if (tmpl.bankDetails) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor).text('Bank Details:', 40, leftY);
          leftY += 12;
          doc.fontSize(8).font('Helvetica').fillColor('#334155').text(tmpl.bankDetails, 40, leftY, { width: 270 });
          leftY += doc.heightOfString(tmpl.bankDetails, { width: 270 }) + 8;
        }

        curY = Math.max(totalsY + 135, leftY + 10);

        // Signature Section
        if (tmpl.showSignature) {
          if (curY + 40 > 720) {
            doc.addPage();
            curY = 660;
          }
          doc.moveTo(400, curY + 25).lineTo(550, curY + 25).strokeColor('#94a3b8').lineWidth(0.5).stroke();
          doc.fontSize(8).font('Helvetica').fillColor('#64748b').text('Authorized Signatory', 400, curY + 29, { width: 150, align: 'center' });
        }

        // Add Footer Note & Page Numbering across all pages
        const pages = doc.bufferedPageRange();
        for (let i = pages.start; i < pages.start + pages.count; i++) {
          doc.switchToPage(i);
          doc.moveTo(40, 755).lineTo(555, 755).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
          doc.fontSize(8).font('Helvetica').fillColor('#64748b');
          doc.text(tmpl.footerNote || 'Thank you for your business!', 40, 762, { width: 350 });
          doc.text(`Page ${i + 1} of ${pages.count}`, 400, 762, { width: 155, align: 'right' });
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
