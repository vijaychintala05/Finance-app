import PDFDocument from 'pdfkit';
import { type DbQueryClient } from '../database/db';
import { amountToWords } from '../utils/numberToWords';

export interface InvoicePdfItem {
  id?: string;
  description: string;
  hsnSac?: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amount: number;
}

export class InvoicePdfService {
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
   * Currency formatter with ISO symbol or currency code
   */
  public static formatAmount(amount: number, symbol: string = '$'): string {
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const absVal = Math.abs(safeAmount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const prefix = symbol.trim();
    const formatted = `${prefix} ${absVal}`;
    return safeAmount < 0 ? `-${formatted}` : formatted;
  }

  /**
   * Generates a certified Tax Invoice PDF document Buffer using PDFKit
   */
  public static async generateInvoicePdf(
    client: DbQueryClient,
    organizationId: string,
    invoiceId: string
  ): Promise<Buffer> {
    // 1. Fetch Invoice
    const invRes = await client.query(
      `SELECT * FROM invoices WHERE organization_id = $1 AND id = $2`,
      [organizationId, invoiceId]
    );
    if (invRes.rows.length === 0) {
      throw new Error(`Invoice record not found: ${invoiceId}`);
    }
    const inv = invRes.rows[0];

    // 2. Fetch Invoice Items
    const itemsRes = await client.query(
      `SELECT id, description, account_id, quantity, unit_price, tax_rate, amount
         FROM invoice_items
        WHERE organization_id = $1 AND invoice_id = $2
        ORDER BY id ASC`,
      [organizationId, invoiceId]
    );

    let items: InvoicePdfItem[] = [];
    if (itemsRes.rows.length > 0) {
      items = itemsRes.rows.map((row) => ({
        id: row.id,
        description: row.description || 'Line Item',
        quantity: Number(row.quantity || 1),
        unitPrice: Number(row.unit_price || 0),
        taxRate: Number(row.tax_rate || 0),
        amount: Number(row.amount || 0),
      }));
    } else if (inv.line_items) {
      const parsed = typeof inv.line_items === 'string' ? JSON.parse(inv.line_items) : inv.line_items;
      items = (Array.isArray(parsed) ? parsed : []).map((it: any) => ({
        id: it.id,
        description: it.description || it.name || it.itemName || 'Line Item',
        hsnSac: it.hsnSac || it.hsn_sac,
        quantity: Number(it.quantity || it.qty || 1),
        unitPrice: Number(it.unitPrice ?? it.unit_price ?? it.rate ?? 0),
        taxRate: Number(it.taxRate ?? it.tax_rate ?? 0),
        amount: Number(it.amount ?? it.lineTotal ?? 0),
      }));
    }

    // 3. Fetch Organization Details & Profile
    const orgRes = await client.query(
      `SELECT o.*, p.legal_name, p.trade_name, p.tax_id AS profile_tax_id, p.gstin AS profile_gstin,
              p.pan, p.address_line1, p.address_line2, p.city AS profile_city, p.state AS profile_state,
              p.postal_code, p.phone AS profile_phone, p.email AS profile_email, p.website,
              p.bank_name, p.bank_account_number, p.bank_ifsc_swift, p.invoice_notes
         FROM organizations o
         LEFT JOIN organization_profiles p ON p.organization_id = o.id
        WHERE o.id = $1`,
      [organizationId]
    );
    const org = orgRes.rows[0] || {};

    // 4. Fetch Bank Details (Fallback to bank_accounts table if not set in profile)
    let bankName = org.bank_name || '';
    let bankAccountNumber = org.bank_account_number || '';
    let bankIfsc = org.bank_ifsc_swift || '';

    if (!bankAccountNumber) {
      const bankAccRes = await client.query(
        `SELECT bank_name, account_number, account_name
           FROM bank_accounts
          WHERE organization_id = $1 AND is_active = true
          ORDER BY created_at ASC
          LIMIT 1`,
        [organizationId]
      );
      if (bankAccRes.rows.length > 0) {
        bankName = bankAccRes.rows[0].bank_name || bankName;
        bankAccountNumber = bankAccRes.rows[0].account_number || bankAccountNumber;
      }
    }

    // 5. Customer / Client details
    let customerSnapshot: any = null;
    if (inv.customer_snapshot) {
      customerSnapshot = typeof inv.customer_snapshot === 'string'
        ? JSON.parse(inv.customer_snapshot)
        : inv.customer_snapshot;
    }

    const clientName = customerSnapshot?.displayName || customerSnapshot?.legalName || inv.client_name || 'Client';
    const clientEmail = customerSnapshot?.email || inv.client_email || '';
    const clientPhone = customerSnapshot?.phone || '';
    const clientGstin = customerSnapshot?.gstin || '';
    
    let clientBillingAddress = '';
    if (customerSnapshot?.billingAddress) {
      const b = customerSnapshot.billingAddress;
      clientBillingAddress = [b.street, b.city, b.state, b.pincode || b.zipCode, b.country]
        .filter(Boolean)
        .join(', ');
    }

    // Currency and Symbol
    const currency = org.base_currency || 'INR';
    const currencySymbol = org.currency_symbol || (currency === 'INR' ? 'INR' : currency);

    // Totals
    const subtotal = Number(inv.subtotal || 0);
    const taxTotal = Number(inv.tax_total || 0);
    const discount = Number(inv.discount || 0);
    const roundOff = Number(inv.round_off_amount || 0);
    const totalAmount = Number(inv.total_amount || 0);
    const paidAmount = Number(inv.paid_amount || 0);
    const balanceDue = Number(inv.balance_due ?? (totalAmount - paidAmount));
    const amountInWords = amountToWords(totalAmount, currency);

    // Organization formatting
    const orgLegalName = org.legal_name || org.name || 'FirmBooks';
    const orgGstin = org.profile_gstin || org.gstin || org.profile_tax_id || org.tax_id || '';
    const orgPan = org.pan || '';
    const orgAddressParts = [
      org.address_line1,
      org.address_line2,
      org.profile_city || org.city,
      org.profile_state || org.state,
      org.postal_code || org.zip_code,
      org.country,
    ].filter(Boolean);
    const orgAddress = orgAddressParts.join(', ');
    const orgEmail = org.profile_email || org.email || '';
    const orgPhone = org.profile_phone || org.phone || '';

    // Interstate tax breakdown check (if state codes or names differ)
    const orgState = (org.profile_state || org.state || '').trim().toLowerCase();
    const clientState = (customerSnapshot?.billingAddress?.state || customerSnapshot?.placeOfSupply || '').trim().toLowerCase();
    const isInterState = Boolean(orgState && clientState && orgState !== clientState);

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    if (taxTotal > 0) {
      if (isInterState) {
        igstAmount = taxTotal;
      } else {
        cgstAmount = Math.round((taxTotal / 2) * 100) / 100;
        sgstAmount = Math.round((taxTotal - cgstAmount) * 100) / 100;
      }
    }

    const primaryColor = '#1e40af'; // Refined corporate deep navy
    const accentColor = '#0f172a'; // Deep slate ink

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        // --- TOP BRAND HEADER BAR ---
        doc.rect(40, 40, 515, 48).fill(primaryColor);

        // Document Title & Subtitle
        doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text('TAX INVOICE', 52, 48, { width: 240 });
        doc.fontSize(8).font('Helvetica').text('ORIGINAL FOR RECIPIENT', 52, 68, { width: 240 });
        
        // Invoice Number & Status Pill
        doc.fontSize(13).font('Helvetica-Bold').text(inv.invoice_number, 320, 48, { width: 225, align: 'right' });
        const statusText = (inv.status || 'DRAFT').toUpperCase();
        doc.fontSize(8.5).font('Helvetica').text(`Status: ${statusText}`, 320, 68, { width: 225, align: 'right' });

        let curY = 100;

        // --- ISSUER (BILLED BY) & INVOICE METADATA ---
        const leftColX = 40;
        const rightColX = 330;

        // Issuer Details (Left)
        doc.fontSize(11).font('Helvetica-Bold').fillColor(accentColor).text(orgLegalName, leftColX, curY, { width: 260 });
        curY += 15;

        if (orgAddress) {
          doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(orgAddress, leftColX, curY, { width: 260 });
          curY += doc.heightOfString(orgAddress, { width: 260 }) + 3;
        }

        if (orgGstin) {
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#334155').text(`GSTIN / Tax ID: `, leftColX, curY, { continued: true });
          doc.font('Helvetica').text(orgGstin);
          curY += 12;
        }

        if (orgPan) {
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#334155').text(`PAN: `, leftColX, curY, { continued: true });
          doc.font('Helvetica').text(orgPan);
          curY += 12;
        }

        const orgContact = [orgEmail ? `Email: ${orgEmail}` : '', orgPhone ? `Phone: ${orgPhone}` : ''].filter(Boolean).join(' | ');
        if (orgContact) {
          doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(orgContact, leftColX, curY, { width: 260 });
          curY += 12;
        }

        // Invoice Metadata (Right)
        let metaY = 100;
        const drawMetaRow = (label: string, value: string, isHighlight: boolean = false) => {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748b').text(label, rightColX, metaY, { width: 100 });
          doc.font(isHighlight ? 'Helvetica-Bold' : 'Helvetica')
            .fillColor(isHighlight ? primaryColor : accentColor)
            .text(value, rightColX + 90, metaY, { width: 135, align: 'right' });
          metaY += 12;
        };

        drawMetaRow('Invoice Date:', inv.issue_date ? new Date(inv.issue_date).toISOString().split('T')[0] : '-');
        drawMetaRow('Payment Due:', inv.due_date ? new Date(inv.due_date).toISOString().split('T')[0] : '-', true);
        drawMetaRow('Payment Terms:', inv.payment_terms || 'Net 30 Days');
        const posValue = customerSnapshot?.billingAddress?.state || customerSnapshot?.placeOfSupply || org.country || 'Standard';
        drawMetaRow('Place of Supply:', String(posValue));
        drawMetaRow('Reverse Charge:', 'No');
        if (inv.sales_order_id) {
          drawMetaRow('Sales Order #:', inv.sales_order_id);
        }
        if (inv.estimate_id) {
          drawMetaRow('Estimate / Quote #:', inv.estimate_id);
        }
        if (inv.project_id) {
          drawMetaRow('Project Ref:', inv.project_id);
        }

        curY = Math.max(curY, metaY) + 8;

        // Thin divider
        doc.moveTo(40, curY).lineTo(555, curY).strokeColor('#e2e8f0').lineWidth(0.75).stroke();
        curY += 10;

        // --- BILLED TO (CUSTOMER) SECTION ---
        doc.rect(40, curY, 515, 18).fill('#f8fafc');
        doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor).text('BILLED TO (CUSTOMER)', 48, curY + 4);
        curY += 24;

        doc.fontSize(10.5).font('Helvetica-Bold').fillColor(accentColor).text(clientName, 48, curY, { width: 320 });
        curY += 14;

        if (clientBillingAddress) {
          doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(clientBillingAddress, 48, curY, { width: 320 });
          curY += doc.heightOfString(clientBillingAddress, { width: 320 }) + 3;
        }

        const clientMetaParts = [
          clientGstin ? `GSTIN: ${clientGstin}` : '',
          clientEmail ? `Email: ${clientEmail}` : '',
          clientPhone ? `Phone: ${clientPhone}` : '',
        ].filter(Boolean);
        if (clientMetaParts.length > 0) {
          doc.fontSize(8.5).font('Helvetica').fillColor('#334155').text(clientMetaParts.join(' | '), 48, curY, { width: 480 });
          curY += 12;
        }

        curY += 10;

        // --- LINE ITEMS TABLE ---
        const drawTableHeader = (y: number) => {
          doc.rect(40, y, 515, 20).fill(primaryColor);
          doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
          doc.text('#', 45, y + 6, { width: 20 });
          doc.text('ITEM / DESCRIPTION', 70, y + 6, { width: 200 });
          doc.text('HSN/SAC', 275, y + 6, { width: 50, align: 'center' });
          doc.text('QTY', 330, y + 6, { width: 40, align: 'right' });
          doc.text('RATE', 375, y + 6, { width: 55, align: 'right' });
          doc.text('TAX %', 435, y + 6, { width: 40, align: 'right' });
          doc.text('AMOUNT', 480, y + 6, { width: 70, align: 'right' });
        };

        drawTableHeader(curY);
        curY += 24;

        if (items.length === 0) {
          doc.fontSize(9).font('Helvetica-Oblique').fillColor('#94a3b8').text('No line items recorded.', 50, curY);
          curY += 20;
        }

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const descHeight = doc.heightOfString(item.description, { width: 200 });
          const rowHeight = Math.max(18, descHeight + 6);

          // Page boundary check (keep space for totals)
          if (curY + rowHeight > 710) {
            doc.addPage();
            curY = 40;
            drawTableHeader(curY);
            curY += 24;
          }

          // Subtle alternating row background
          if (i % 2 === 1) {
            doc.rect(40, curY - 2, 515, rowHeight).fill('#fbfcfd');
          }

          doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
          doc.text(String(i + 1), 45, curY, { width: 20 });
          doc.font('Helvetica-Bold').fillColor(accentColor).text(item.description, 70, curY, { width: 200 });

          doc.font('Helvetica').fillColor('#475569');
          doc.text(item.hsnSac || '-', 275, curY, { width: 50, align: 'center' });
          doc.text(String(item.quantity), 330, curY, { width: 40, align: 'right' });
          doc.text(this.formatAmount(item.unitPrice, currencySymbol), 375, curY, { width: 55, align: 'right' });
          doc.text(`${item.taxRate}%`, 435, curY, { width: 40, align: 'right' });
          doc.font('Helvetica-Bold').fillColor(accentColor).text(this.formatAmount(item.amount, currencySymbol), 480, curY, { width: 70, align: 'right' });

          curY += rowHeight;
          doc.moveTo(40, curY - 2).lineTo(555, curY - 2).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
        }

        curY += 8;

        // --- STATUTORY GST / TAX BREAKDOWN TABLE ---
        if (taxTotal > 0 && items.some((it) => it.taxRate > 0)) {
          if (curY + 50 > 715) {
            doc.addPage();
            curY = 40;
          }

          doc.fontSize(8).font('Helvetica-Bold').fillColor(primaryColor).text('TAX BREAKDOWN SUMMARY', 40, curY);
          curY += 11;

          const taxHeadY = curY;
          doc.rect(40, taxHeadY, 515, 14).fill('#f1f5f9');
          doc.fontSize(7).font('Helvetica-Bold').fillColor('#334155');
          doc.text('HSN/SAC', 45, taxHeadY + 3, { width: 70 });
          doc.text('TAXABLE VALUE', 120, taxHeadY + 3, { width: 90, align: 'right' });
          if (isInterState) {
            doc.text('IGST RATE', 220, taxHeadY + 3, { width: 60, align: 'right' });
            doc.text('IGST AMOUNT', 290, taxHeadY + 3, { width: 90, align: 'right' });
          } else {
            doc.text('CGST AMT', 220, taxHeadY + 3, { width: 70, align: 'right' });
            doc.text('SGST AMT', 300, taxHeadY + 3, { width: 70, align: 'right' });
          }
          doc.text('TOTAL TAX', 400, taxHeadY + 3, { width: 150, align: 'right' });
          curY += 16;

          // Aggregate by tax rate
          const rateGroups = new Map<number, { taxable: number; tax: number; hsn: string }>();
          for (const it of items) {
            const r = it.taxRate || 0;
            if (!rateGroups.has(r)) rateGroups.set(r, { taxable: 0, tax: 0, hsn: it.hsnSac || '9983' });
            const g = rateGroups.get(r)!;
            g.taxable += it.amount;
            g.tax += (it.amount * r) / 100;
          }

          for (const [rate, g] of rateGroups.entries()) {
            doc.fontSize(7).font('Helvetica').fillColor('#475569');
            doc.text(g.hsn, 45, curY, { width: 70 });
            doc.text(this.formatAmount(g.taxable, currencySymbol), 120, curY, { width: 90, align: 'right' });
            if (isInterState) {
              doc.text(`${rate}%`, 220, curY, { width: 60, align: 'right' });
              doc.text(this.formatAmount(g.tax, currencySymbol), 290, curY, { width: 90, align: 'right' });
            } else {
              doc.text(this.formatAmount(g.tax / 2, currencySymbol), 220, curY, { width: 70, align: 'right' });
              doc.text(this.formatAmount(g.tax / 2, currencySymbol), 300, curY, { width: 70, align: 'right' });
            }
            doc.font('Helvetica-Bold').fillColor(accentColor).text(this.formatAmount(g.tax, currencySymbol), 400, curY, { width: 150, align: 'right' });
            curY += 12;
          }
          doc.moveTo(40, curY).lineTo(555, curY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
          curY += 8;
        }

        // --- TOTALS & REMITTANCE SECTION ---
        // Ensure space for summary box (approx 160pt)
        if (curY + 160 > 715) {
          doc.addPage();
          curY = 40;
        }

        const totalsY = curY;
        const boxX = 330;
        const boxWidth = 225;

        // Draw Totals Box (Right)
        let ty = totalsY + 8;
        doc.rect(boxX, totalsY, boxWidth, 140).fillAndStroke('#f8fafc', '#cbd5e1');

        const drawTotalLine = (label: string, value: string, isDeduction: boolean = false, isBold: boolean = false) => {
          doc.fontSize(8.5).font(isBold ? 'Helvetica-Bold' : 'Helvetica').fillColor(isBold ? accentColor : '#475569');
          doc.text(label, boxX + 10, ty);
          doc.fillColor(isDeduction ? '#dc2626' : isBold ? accentColor : '#1e293b');
          doc.text(value, boxX + 85, ty, { width: 130, align: 'right' });
          ty += 13;
        };

        drawTotalLine('Subtotal:', this.formatAmount(subtotal, currencySymbol));

        if (discount > 0) {
          drawTotalLine('Discount:', `-${this.formatAmount(discount, currencySymbol)}`, true);
        }

        if (cgstAmount > 0 || sgstAmount > 0) {
          drawTotalLine('CGST:', this.formatAmount(cgstAmount, currencySymbol));
          drawTotalLine('SGST:', this.formatAmount(sgstAmount, currencySymbol));
        } else if (igstAmount > 0) {
          drawTotalLine('IGST (Interstate):', this.formatAmount(igstAmount, currencySymbol));
        } else if (taxTotal > 0) {
          drawTotalLine('Tax Total:', this.formatAmount(taxTotal, currencySymbol));
        }

        if (roundOff !== 0) {
          drawTotalLine('Round Off:', this.formatAmount(roundOff, currencySymbol));
        }

        // Grand Total Line
        doc.moveTo(boxX + 10, ty).lineTo(boxX + 215, ty).strokeColor(primaryColor).lineWidth(1).stroke();
        ty += 5;

        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(primaryColor).text('Total Amount:', boxX + 10, ty);
        doc.text(this.formatAmount(totalAmount, currencySymbol), boxX + 85, ty, { width: 130, align: 'right' });
        ty += 15;

        if (paidAmount > 0) {
          drawTotalLine('Payments Received:', `-${this.formatAmount(paidAmount, currencySymbol)}`, true);
        }

        // Balance Due Highlighted Banner inside Box
        doc.rect(boxX + 8, ty, boxWidth - 16, 20).fill('#eff6ff');
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1d4ed8').text('Balance Due:', boxX + 14, ty + 5);
        doc.text(this.formatAmount(balanceDue, currencySymbol), boxX + 85, ty + 5, { width: 120, align: 'right' });

        // --- REMITTANCE & BANK DETAILS (Left Section) ---
        let leftY = totalsY;

        // Amount in Words
        if (amountInWords) {
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor(primaryColor).text('Amount in Words:', 40, leftY);
          leftY += 11;
          doc.fontSize(8).font('Helvetica-Oblique').fillColor('#334155').text(amountInWords, 40, leftY, { width: 270 });
          leftY += doc.heightOfString(amountInWords, { width: 270 }) + 8;
        }

        // Bank Remittance Box
        if (bankAccountNumber || bankName) {
          doc.rect(40, leftY, 275, 62).fillAndStroke('#f0fdf4', '#bbf7d0');
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#15803d').text('Remittance Instructions / Bank Details:', 48, leftY + 5);
          
          let bY = leftY + 16;
          doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#1e293b').text(`Beneficiary: ${orgLegalName}`, 48, bY);
          bY += 9;
          if (bankName) {
            doc.fontSize(7.5).font('Helvetica').fillColor('#1e293b').text(`Bank Name: ${bankName}`, 48, bY);
            bY += 9;
          }
          if (bankAccountNumber) {
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#0f172a').text(`Account #: ${bankAccountNumber}`, 48, bY, { continued: Boolean(bankIfsc) });
            if (bankIfsc) {
              doc.font('Helvetica').text(`  |  IFSC/SWIFT: ${bankIfsc}`);
            }
            bY += 9;
          }
          doc.fontSize(7).font('Helvetica-Oblique').fillColor('#475569').text(`Ref: Please quote ${inv.invoice_number} with wire transfer.`, 48, bY);
          leftY += 70;
        }

        // Notes & Terms
        const notes = inv.notes || org.invoice_notes;
        if (notes) {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#475569').text('Notes:', 40, leftY);
          leftY += 10;
          doc.fontSize(7.5).font('Helvetica').fillColor('#64748b').text(notes, 40, leftY, { width: 270 });
          leftY += doc.heightOfString(notes, { width: 270 }) + 6;
        }

        const terms = inv.terms || 'Payment is due per invoice payment terms. Late payments subject to statutory interest.';
        if (terms) {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#475569').text('Terms & Conditions:', 40, leftY);
          leftY += 10;
          doc.fontSize(7.5).font('Helvetica').fillColor('#64748b').text(terms, 40, leftY, { width: 270 });
          leftY += doc.heightOfString(terms, { width: 270 }) + 6;
        }

        // Statutory Declaration
        doc.fontSize(7).font('Helvetica-Oblique').fillColor('#64748b').text(
          'Declaration: We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.',
          40,
          leftY,
          { width: 270 }
        );
        leftY += 16;

        curY = Math.max(totalsY + 150, leftY + 10);

        // --- AUTHORIZED SIGNATORY (Bottom Right) ---
        if (curY + 50 > 720) {
          doc.addPage();
          curY = 650;
        }

        const sigX = 390;
        doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(`For ${orgLegalName}`, sigX, curY + 10, { width: 165, align: 'center' });
        doc.moveTo(sigX + 10, curY + 45).lineTo(sigX + 155, curY + 45).strokeColor('#94a3b8').lineWidth(0.75).stroke();
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155').text('Authorized Signatory', sigX, curY + 48, { width: 165, align: 'center' });

        // --- FOOTER & RUNNING PAGE NUMBERS ACROSS ALL PAGES ---
        const pages = doc.bufferedPageRange();
        for (let i = pages.start; i < pages.start + pages.count; i++) {
          doc.switchToPage(i);
          doc.moveTo(40, 755).lineTo(555, 755).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
          doc.fontSize(8).font('Helvetica').fillColor('#64748b');
          doc.text('This is a computer-generated tax invoice issued by FirmBooks.', 40, 762, { width: 350 });
          doc.text(`Page ${i + 1} of ${pages.count}`, 400, 762, { width: 155, align: 'right' });
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
