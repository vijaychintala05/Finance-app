import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database/db';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';
import { QuotationEngine } from '../sales/QuotationEngine';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ServerPostingEngine } from '../accounting/postingEngine';

const ORG = F.ORG_A.id;
const ACTOR = F.PERSONAS.ORG_A.owner.id;
const CUST = F.CUSTOMERS.A1.id;
const VEND = F.VENDORS.A1.id;

describe('Stage 2 — Complete document lifecycles and everyday workflows', () => {
  beforeEach(async () => {
    await MasterFinanceFixture.setup();
  });

  async function verifyLedgerBalanced(): Promise<void> {
    const res = await db.query(
      `SELECT journal_entry_id, SUM(debit) as debits, SUM(credit) as credits
       FROM journal_lines
       WHERE organization_id = $1
       GROUP BY journal_entry_id`,
      [ORG]
    );
    for (const row of res.rows) {
      const diff = Math.abs(Number(row.debits) - Number(row.credits));
      expect(diff).toBeLessThan(0.001);
    }
  }

  describe('Sales Journey (Quotation -> Sales Order -> Delivery -> Invoice -> Payment)', () => {
    it('executes full sales lifecycle with lineage links and balance updates', async () => {
      // 1. Create Quotation
      const quotation = await QuotationEngine.createQuotation(ORG, {
        customerId: CUST,
        issueDate: '2026-03-01',
        validUntil: '2026-03-31',
        notes: 'Stage 2 sales quotation',
        lineItems: [
          { description: 'Design Consultation', quantity: 1, unitPrice: 10000, taxRate: 0, amount: 10000 },
        ],
      }, ACTOR);
      expect(quotation.id).toBeDefined();
      expect(quotation.status).toBe('DRAFT');

      // 2. Convert Quotation -> Sales Order
      const so = await SalesEngine.createSalesOrder(ORG, {
        estimateId: quotation.id,
        customerId: CUST,
        orderDate: '2026-03-02',
        expectedDelivery: '2026-03-15',
        totalAmount: 10000,
        status: 'CONFIRMED',
        notes: 'Converted from quotation',
        lineItems: [
          { description: 'Design Consultation', quantity: 1, unitPrice: 10000, taxRate: 0, amount: 10000 },
        ],
      }, undefined, ACTOR);
      expect(so.id).toBeDefined();
      expect(so.estimateId).toBe(quotation.id);
      expect(so.totalAmount).toBe(10000);

      // Verify quotation marked CONVERTED
      const estRes = await db.query('SELECT status FROM estimates WHERE organization_id = $1 AND id = $2', [ORG, quotation.id]);
      expect(estRes.rows[0].status).toBe('CONVERTED');

      // 3. Partial Delivery Challan
      const challan1 = await SalesEngine.fulfillSalesOrder(ORG, so.id, ACTOR, {
        deliveryDate: '2026-03-05',
        fulfilledAmount: 4000,
        reason: 'Partial delivery phase 1',
      });
      expect(challan1.salesOrder.fulfilledAmount).toBe(4000);
      expect(challan1.salesOrder.status).toBe('PARTIALLY_FULFILLED');

      // Full delivery
      const challan2 = await SalesEngine.fulfillSalesOrder(ORG, so.id, ACTOR, {
        deliveryDate: '2026-03-10',
        fulfilledAmount: 6000,
        reason: 'Final delivery phase 2',
      });
      expect(challan2.salesOrder.fulfilledAmount).toBe(10000);
      expect(challan2.salesOrder.status).toBe('FULFILLED');

      // Cannot over-fulfill
      await expect(
        SalesEngine.fulfillSalesOrder(ORG, so.id, ACTOR, {
          deliveryDate: '2026-03-11',
          fulfilledAmount: 1000,
        })
      ).rejects.toThrow(/already fully fulfilled/i);

      // 4. Partial Invoicing (5000 of 10000)
      const inv1 = await SalesEngine.convertSalesOrderToInvoice(ORG, so.id, ACTOR, 5000);
      expect(inv1.invoice.salesOrderId).toBe(so.id);
      expect(inv1.invoice.totalAmount).toBe(5000);
      expect(inv1.salesOrder.invoicedAmount).toBe(5000);
      expect(inv1.salesOrder.status).toBe('PARTIALLY_INVOICED');

      // Second invoice completing billing (remaining 5000)
      const inv2 = await SalesEngine.convertSalesOrderToInvoice(ORG, so.id, ACTOR, 5000);
      expect(inv2.invoice.salesOrderId).toBe(so.id);
      expect(inv2.invoice.totalAmount).toBe(5000);
      expect(inv2.salesOrder.invoicedAmount).toBe(10000);
      expect(inv2.salesOrder.status).toBe('INVOICED');

      // Cannot over-bill sales order
      await expect(
        SalesEngine.convertSalesOrderToInvoice(ORG, so.id, ACTOR, 1000)
      ).rejects.toThrow(/already fully invoiced/i);

      // 5. Payment on First Invoice
      const payment = await SalesEngine.recordCustomerPayment(ORG, {
        customerId: CUST,
        invoiceId: inv1.invoice.id,
        amount: 5000,
        paymentDate: '2026-03-12',
        paymentMode: 'Bank Transfer',
        depositAccountId: `acc-${ORG}-1010`,
      }, ACTOR);
      expect(payment.id).toBeDefined();

      const invCheck = await SalesEngine.getInvoice(ORG, inv1.invoice.id);
      expect(invCheck?.status).toBe('PAID');
      expect(Number(invCheck?.balanceDue)).toBe(0);

      // Check journal debits and credits balance
      await verifyLedgerBalanced();
    });

    it('enforces cancellation guardrails on Quotations and Sales Orders', async () => {
      // Create Quotation
      const quotation = await QuotationEngine.createQuotation(ORG, {
        customerId: CUST,
        issueDate: '2026-03-01',
        validUntil: '2026-03-31',
        notes: 'Quotation for cancellation test',
        lineItems: [{ description: 'Item A', quantity: 1, unitPrice: 1500, taxRate: 0, amount: 1500 }],
      }, ACTOR);

      // Cancel Quotation
      const cancelledQuote = await QuotationEngine.cancelQuotation(ORG, quotation.id, ACTOR, 'Client chose another vendor');
      expect(cancelledQuote.status).toBe('DECLINED');

      // Cannot convert a cancelled/declined quotation
      await expect(
        SalesEngine.createSalesOrder(ORG, {
          estimateId: quotation.id,
          customerId: CUST,
          orderDate: '2026-03-02',
          totalAmount: 1500,
          status: 'CONFIRMED',
          lineItems: [{ description: 'Item A', quantity: 1, unitPrice: 1500, taxRate: 0, amount: 1500 }],
        }, undefined, ACTOR)
      ).rejects.toThrow(/not convertible/i);

      // Create a fresh Sales Order directly
      const so = await SalesEngine.createSalesOrder(ORG, {
        customerId: CUST,
        orderDate: '2026-03-03',
        totalAmount: 3000,
        status: 'CONFIRMED',
        lineItems: [{ description: 'Direct order', quantity: 1, unitPrice: 3000, taxRate: 0, amount: 3000 }],
      }, undefined, ACTOR);

      // Fulfill part of it
      await SalesEngine.fulfillSalesOrder(ORG, so.id, ACTOR, {
        deliveryDate: '2026-03-04',
        fulfilledAmount: 1000,
      });

      // Cannot cancel an active sales order with fulfilled deliveries
      await expect(
        SalesEngine.cancelSalesOrder(ORG, so.id, ACTOR, 'Cancel partially fulfilled order')
      ).rejects.toThrow(/Cannot cancel a sales order with active deliveries/i);

      // Create an untouched sales order
      const freshSo = await SalesEngine.createSalesOrder(ORG, {
        customerId: CUST,
        orderDate: '2026-03-05',
        totalAmount: 2000,
        status: 'CONFIRMED',
        lineItems: [{ description: 'Untouched order', quantity: 1, unitPrice: 2000, taxRate: 0, amount: 2000 }],
      }, undefined, ACTOR);

      // Cancelling an untouched sales order succeeds
      const cancelledSo = await SalesEngine.cancelSalesOrder(ORG, freshSo.id, ACTOR, 'Customer retracted');
      expect(cancelledSo.status).toBe('CANCELLED');

      // Cannot convert or fulfill a cancelled sales order
      await expect(
        SalesEngine.convertSalesOrderToInvoice(ORG, freshSo.id, ACTOR, 2000)
      ).rejects.toThrow(/cannot be converted/i);

      await expect(
        SalesEngine.fulfillSalesOrder(ORG, freshSo.id, ACTOR, { deliveryDate: '2026-03-06' })
      ).rejects.toThrow(/Cannot fulfill a cancelled sales order/i);
    });
  });

  describe('Purchasing Journey (Purchase Order -> Goods Receipt -> Bill -> Payment)', () => {
    it('executes full purchasing journey with partial receipt, partial billing, and settlements', async () => {
      // 1. Create Purchase Order
      const po = await PurchasesEngine.createPurchaseOrder(ORG, {
        vendorId: VEND,
        vendorName: 'Vendor A1',
        orderDate: '2026-03-01',
        expectedDelivery: '2026-03-15',
        totalAmount: 8000,
        status: 'DRAFT',
        notes: 'Procurement of raw materials',
        lineItems: [
          { description: 'Commercial Plywood', quantity: 2, unitPrice: 4000, taxRate: 0, amount: 8000 },
        ],
      });
      expect(po.id).toBeDefined();
      expect(po.status).toBe('DRAFT');

      // 2. Approve Purchase Order
      const approvedPo = await PurchasesEngine.approvePurchaseOrder(ORG, po.id);
      expect(approvedPo.status).toBe('APPROVED');

      // 3. Receive Goods Receipt (GRN)
      const receipt = await PurchasesEngine.receivePurchaseOrder(ORG, po.id, ACTOR, {
        receiptDate: '2026-03-05',
        receivedAmount: 4000,
        notes: 'First batch of plywood received',
      });
      expect(receipt.id).toBeDefined();
      expect(receipt.purchaseOrderId).toBe(po.id);

      // PO status updated to PARTIALLY_RECEIVED
      const poAfterReceipt = await PurchasesEngine.getPurchaseOrder(ORG, po.id);
      expect(poAfterReceipt?.status).toBe('PARTIALLY_RECEIVED');

      // 4. Convert Purchase Order to Bill (Partial: 4000)
      const bill1 = await PurchasesEngine.convertPurchaseOrderToBill(ORG, po.id, ACTOR, 4000);
      expect(bill1.id).toBeDefined();
      expect(bill1.purchaseOrderId).toBe(po.id);
      expect(Number(bill1.totalAmount)).toBe(4000);

      const poAfterBill1 = await PurchasesEngine.getPurchaseOrder(ORG, po.id);
      expect(Number(poAfterBill1?.billedAmount)).toBe(4000);
      expect(poAfterBill1?.status).toBe('PARTIALLY_BILLED');

      // Convert remaining 4000
      const bill2 = await PurchasesEngine.convertPurchaseOrderToBill(ORG, po.id, ACTOR, 4000);
      expect(bill2.id).toBeDefined();
      expect(bill2.purchaseOrderId).toBe(po.id);
      expect(Number(bill2.totalAmount)).toBe(4000);

      const poAfterBill2 = await PurchasesEngine.getPurchaseOrder(ORG, po.id);
      expect(Number(poAfterBill2?.billedAmount)).toBe(8000);
      expect(poAfterBill2?.status).toBe('BILLED');

      // Cannot over-bill PO
      await expect(
        PurchasesEngine.convertPurchaseOrderToBill(ORG, po.id, ACTOR, 1000)
      ).rejects.toThrow(/already fully billed/i);

      // 5. Post Vendor Payment on Bill 1
      const vendorPayment = await PurchasesEngine.createVendorPayment(ORG, {
        vendorId: VEND,
        vendorName: 'Vendor A1',
        paymentDate: '2026-03-10',
        amount: 4000,
        paidFromAccountId: `acc-${ORG}-1010`,
        allocations: [{ billId: bill1.id, amount: 4000 }],
        paymentMode: 'NEFT',
      }, ACTOR);
      expect(vendorPayment.id).toBeDefined();

      const billCheck = await PurchasesEngine.getBill(ORG, bill1.id);
      expect(billCheck?.status).toBe('PAID');
      expect(Number(billCheck?.balanceDue)).toBe(0);

      // Verify GL debit and credit equality
      await verifyLedgerBalanced();
    });

    it('enforces cancellation guardrails on Purchase Orders', async () => {
      // 1. Create a PO and bill part of it
      const po = await PurchasesEngine.createPurchaseOrder(ORG, {
        vendorId: VEND,
        vendorName: 'Vendor A1',
        orderDate: '2026-03-01',
        totalAmount: 5000,
        status: 'APPROVED',
        lineItems: [{ description: 'Timber', quantity: 1, unitPrice: 5000, taxRate: 0, amount: 5000 }],
      });

      await PurchasesEngine.convertPurchaseOrderToBill(ORG, po.id, ACTOR, 2000);

      // Cannot cancel a PO with active bills
      await expect(
        PurchasesEngine.cancelPurchaseOrder(ORG, po.id, ACTOR, 'Cancel billed PO')
      ).rejects.toThrow(/Cannot cancel a purchase order with active bills/i);

      // 2. Create an untouched PO
      const untouchedPo = await PurchasesEngine.createPurchaseOrder(ORG, {
        vendorId: VEND,
        vendorName: 'Vendor A1',
        orderDate: '2026-03-02',
        totalAmount: 3000,
        status: 'DRAFT',
        lineItems: [{ description: 'Mouldings', quantity: 1, unitPrice: 3000, taxRate: 0, amount: 3000 }],
      });

      // Cancellation succeeds
      const cancelledPo = await PurchasesEngine.cancelPurchaseOrder(ORG, untouchedPo.id, ACTOR, 'Vendor out of stock');
      expect(cancelledPo.status).toBe('CANCELLED');

      // Cannot convert a cancelled PO to a bill
      await expect(
        PurchasesEngine.convertPurchaseOrderToBill(ORG, untouchedPo.id, ACTOR, 3000)
      ).rejects.toThrow(/cannot be converted/i);
    });
  });

  describe('Advances, Credit Applications, Refunds, and Write-Offs', () => {
    it('handles customer advance recording, invoice application, and reversal', async () => {
      // 1. Record customer advance
      const advance = await SalesEngine.recordCustomerAdvance(ORG, {
        customerId: CUST,
        amount: 5000,
        paymentDate: '2026-03-01',
        depositAccountId: `acc-${ORG}-1010`,
        paymentMode: 'Bank Transfer',
        notes: 'Upfront project retainer',
      }, ACTOR);
      expect(advance.id).toBeDefined();

      // Verify advance appears in customer advance balance
      const advRes = await SalesEngine.getCustomerAdvances(ORG, CUST);
      expect(advRes.length).toBeGreaterThan(0);

      // 2. Create an invoice
      const invoice = await SalesEngine.createAndPostInvoice(ORG, {
        customerId: CUST,
        issueDate: '2026-03-02',
        dueDate: '2026-03-31',
        lineItems: [{ description: 'Design Work', quantity: 1, unitPrice: 8000, taxRate: 0 }],
      });
      expect(Number(invoice.balanceDue)).toBe(8000);

      // 3. Apply customer advance to invoice
      const application = await SalesEngine.applyCustomerAdvance(ORG, {
        advanceId: advance.id,
        customerId: CUST,
        invoiceId: invoice.id,
        amount: 5000,
        appliedDate: '2026-03-03',
      }, ACTOR);
      expect(application.id).toBeDefined();

      // Check remaining invoice balance
      const updatedInv = await SalesEngine.getInvoice(ORG, invoice.id);
      expect(Number(updatedInv?.balanceDue)).toBe(3000);

      // 4. Reverse advance application
      await SalesEngine.reverseCustomerAdvanceApplication(ORG, application.id, ACTOR, 'Reversing advance application');
      const restoredInv = await SalesEngine.getInvoice(ORG, invoice.id);
      expect(Number(restoredInv?.balanceDue)).toBe(8000);

      // Verify GL is balanced
      await verifyLedgerBalanced();
    });

    it('handles credit note creation, invoice application, refund, and write-off', async () => {
      // 1. Create an invoice
      const invoice = await SalesEngine.createAndPostInvoice(ORG, {
        customerId: CUST,
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        lineItems: [{ description: 'Consulting', quantity: 1, unitPrice: 10000, taxRate: 0 }],
      });

      // 2. Create Credit Note against the invoice
      const cn = await SalesEngine.createCreditNote(ORG, {
        customerId: CUST,
        invoiceId: invoice.id,
        amount: 3000,
        issueDate: '2026-03-05',
        reason: 'Scope reduction discount',
      }, ACTOR);
      expect(cn.id).toBeDefined();

      // 3. Apply Credit Note to invoice
      const appRes = await SalesEngine.applyCreditNote(ORG, {
        creditNoteId: cn.id,
        invoiceId: invoice.id,
        amount: 2000,
        appliedDate: '2026-03-06',
      }, ACTOR);
      expect(appRes.id).toBeDefined();

      const invAfterCN = await SalesEngine.getInvoice(ORG, invoice.id);
      expect(Number(invAfterCN?.balanceDue)).toBe(8000);

      // 4. Record Customer Refund for remaining 1000 credit
      const refund = await SalesEngine.recordCustomerRefund(ORG, {
        creditNoteId: cn.id,
        customerId: CUST,
        amount: 1000,
        refundDate: '2026-03-07',
        paymentAccountId: `acc-${ORG}-1010`,
        paymentMode: 'Bank Wire',
        reason: 'Direct refund of remaining credit',
      }, ACTOR);
      expect(refund.id).toBeDefined();

      // 5. Record Receivable Write-Off for remaining invoice balance (e.g. 1000 bad debt)
      const writeOff = await SalesEngine.recordWriteOff(ORG, {
        invoiceId: invoice.id,
        amount: 1000,
        writeOffDate: '2026-03-08',
        reason: 'Bad debt write off',
        badDebtAccountId: `acc-${ORG}-6000`,
      }, ACTOR);
      expect(writeOff.id).toBeDefined();

      const invAfterWriteOff = await SalesEngine.getInvoice(ORG, invoice.id);
      expect(Number(invAfterWriteOff?.balanceDue)).toBe(7000);

      // Check GL balance
      await verifyLedgerBalanced();
    });
  });
});
