import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database/db';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';
import { QuotationEngine } from '../sales/QuotationEngine';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';

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
      await expect(SalesEngine.updateSalesOrder(ORG, so.id, { status: 'CONFIRMED' }, ACTOR))
        .rejects.toThrow(/after invoicing, fulfillment, shipment/i);

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
      await expect(SalesEngine.updateSalesOrder(ORG, so.id, { status: 'CONFIRMED' }, ACTOR))
        .rejects.toThrow(/after invoicing, fulfillment, shipment/i);
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

      // Generic status updates cannot bypass guarded cancellation or its audit reason.
      const auditBefore = await db.query(
        `SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'SalesOrder' AND entity_id = $2 AND action = 'SALES_ORDER_UPDATED'`,
        [ORG, freshSo.id]
      );
      for (const status of ['CANCELLED', 'Cancelled']) {
        await expect(SalesEngine.updateSalesOrder(ORG, freshSo.id, { status: status as any }, ACTOR))
          .rejects.toThrow(/audited cancellation endpoint/i);
      }
      expect((await SalesEngine.getSalesOrder(ORG, freshSo.id))?.status).toBe('CONFIRMED');
      const auditAfter = await db.query(
        `SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'SalesOrder' AND entity_id = $2 AND action = 'SALES_ORDER_UPDATED'`,
        [ORG, freshSo.id]
      );
      expect(auditAfter.rows[0].count).toBe(auditBefore.rows[0].count);
      await expect(SalesEngine.cancelSalesOrder(ORG, freshSo.id, ACTOR, '  '))
        .rejects.toThrow(/between 3 and 1000 characters/i);
      await expect(SalesEngine.cancelSalesOrder(ORG, freshSo.id, ACTOR, 'x'.repeat(1001)))
        .rejects.toThrow(/between 3 and 1000 characters/i);
      for (const status of ['SHIPPED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'PARTIALLY_INVOICED', 'INVOICED', 'CLOSED']) {
        await expect(SalesEngine.updateSalesOrder(ORG, freshSo.id, { status: status as any }, ACTOR))
          .rejects.toThrow(/dedicated lifecycle workflow/i);
      }

      const legacyShipped = await SalesEngine.createSalesOrder(ORG, { customerId: CUST, orderDate: '2026-03-08', totalAmount: 700, status: 'CONFIRMED', lineItems: [{ description: 'Legacy shipped order', quantity: 1, unitPrice: 700, taxRate: 0, amount: 700 }] }, undefined, ACTOR);
      await db.query("UPDATE sales_orders SET status = 'SHIPPED' WHERE organization_id = $1 AND id = $2", [ORG, legacyShipped.id]);
      await expect(SalesEngine.updateSalesOrder(ORG, legacyShipped.id, { status: 'CONFIRMED' }, ACTOR))
        .rejects.toThrow(/after invoicing, fulfillment, shipment/i);
      await expect(SalesEngine.cancelSalesOrder(ORG, legacyShipped.id, ACTOR, 'Customer withdrew order'))
        .rejects.toThrow(/legacy shipped.*reviewing delivery evidence/i);

      const closedSo = await SalesEngine.createSalesOrder(ORG, { customerId: CUST, orderDate: '2026-03-09', totalAmount: 800, status: 'CONFIRMED', lineItems: [{ description: 'Closed order', quantity: 1, unitPrice: 800, taxRate: 0, amount: 800 }] }, undefined, ACTOR);
      await db.query("UPDATE sales_orders SET status = 'CLOSED' WHERE organization_id = $1 AND id = $2", [ORG, closedSo.id]);
      await expect(SalesEngine.updateSalesOrder(ORG, closedSo.id, { status: 'CONFIRMED' }, ACTOR))
        .rejects.toThrow(/after invoicing, fulfillment, shipment/i);
      await expect(SalesEngine.cancelSalesOrder(ORG, closedSo.id, ACTOR, 'Customer withdrew order'))
        .rejects.toThrow(/Cannot cancel a closed sales order/i);

      // Concurrent manual status edits and cancellation serialize on the same row; cancellation remains authoritative.
      const raceSo = await SalesEngine.createSalesOrder(ORG, { customerId: CUST, orderDate: '2026-03-07', totalAmount: 500, status: 'CONFIRMED', lineItems: [{ description: 'Concurrent cancel', quantity: 1, unitPrice: 500, taxRate: 0, amount: 500 }] }, undefined, ACTOR);
      const raceResults = await Promise.allSettled([
        SalesEngine.updateSalesOrder(ORG, raceSo.id, { status: 'IN_PRODUCTION' }, ACTOR),
        SalesEngine.cancelSalesOrder(ORG, raceSo.id, ACTOR, 'Customer cancelled order'),
      ]);
      expect(raceResults.some((result) => result.status === 'fulfilled' && (result.value as any).status === 'CANCELLED')).toBe(true);
      expect((await SalesEngine.getSalesOrder(ORG, raceSo.id))?.status).toBe('CANCELLED');

      // Cancelling an untouched sales order succeeds only through the dedicated endpoint.
      const cancelledSo = await SalesEngine.cancelSalesOrder(ORG, freshSo.id, ACTOR, 'Customer retracted');
      const cancellationAuditBeforeRetry = await db.query(
        `SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'SalesOrder' AND entity_id = $2 AND action = 'SALES_ORDER_CANCELLED'`,
        [ORG, freshSo.id]
      );
      const retriedCancellation = await SalesEngine.cancelSalesOrder(ORG, freshSo.id, ACTOR, 'Customer retracted');
      expect(retriedCancellation.status).toBe('CANCELLED');
      const cancellationAuditAfterRetry = await db.query(
        `SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'SalesOrder' AND entity_id = $2 AND action = 'SALES_ORDER_CANCELLED'`,
        [ORG, freshSo.id]
      );
      expect(cancellationAuditAfterRetry.rows[0].count).toBe(cancellationAuditBeforeRetry.rows[0].count);
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

    it('closes direct, delayed, cancellation, fulfillment, and void bypasses for linked sales orders', async () => {
      const directBlocked = await SalesEngine.createSalesOrder(ORG, { customerId: CUST, orderDate: '2026-04-01', totalAmount: 1200, status: 'CONFIRMED', lineItems: [{ description: 'Direct posting guard', quantity: 1, unitPrice: 1200, taxRate: 0 }] }, undefined, ACTOR);
      await SalesEngine.cancelSalesOrder(ORG, directBlocked.id, ACTOR, 'Customer withdrew');
      await expect(SalesEngine.createAndPostInvoice(ORG, { salesOrderId: directBlocked.id, customerId: CUST, issueDate: '2026-04-02', dueDate: '2026-05-02', status: 'POSTED', lineItems: [{ description: 'Forbidden invoice', quantity: 1, unitPrice: 1200, taxRate: 0 }] }, ACTOR))
        .rejects.toThrow(/cannot accept invoices.*CANCELLED/i);

      const pending = await SalesEngine.createSalesOrder(ORG, { customerId: CUST, orderDate: '2026-04-03', totalAmount: 900, status: 'CONFIRMED', lineItems: [{ description: 'Pending invoice guard', quantity: 1, unitPrice: 900, taxRate: 0 }] }, undefined, ACTOR);
      const draft = await SalesEngine.createAndPostInvoice(ORG, { salesOrderId: pending.id, customerId: CUST, issueDate: '2026-04-03', dueDate: '2026-05-03', status: 'DRAFT', lineItems: [{ description: 'Pending invoice', quantity: 1, unitPrice: 900, taxRate: 0 }] }, ACTOR);
      await expect(SalesEngine.cancelSalesOrder(ORG, pending.id, ACTOR, 'Cancel despite draft'))
        .rejects.toThrow(/existing invoiced balance/i);
      await db.query(`UPDATE sales_orders SET status = 'CANCELLED', invoiced_amount = 0 WHERE organization_id = $1 AND id = $2`, [ORG, pending.id]);
      await expect(SalesEngine.postInvoice(ORG, ACTOR, draft.id)).rejects.toThrow(/cannot accept invoices.*CANCELLED/i);

      const staleCounter = await SalesEngine.createSalesOrder(ORG, { customerId: CUST, orderDate: '2026-04-04', totalAmount: 600, status: 'CONFIRMED', lineItems: [{ description: 'Stale counter evidence', quantity: 1, unitPrice: 600, taxRate: 0 }] }, undefined, ACTOR);
      await SalesEngine.createAndPostInvoice(ORG, { salesOrderId: staleCounter.id, customerId: CUST, issueDate: '2026-04-04', dueDate: '2026-05-04', status: 'POSTED', lineItems: [{ description: 'Linked posted invoice', quantity: 1, unitPrice: 200, taxRate: 0 }] }, ACTOR);
      await db.query(`UPDATE sales_orders SET invoiced_amount = 0 WHERE organization_id = $1 AND id = $2`, [ORG, staleCounter.id]);
      await expect(SalesEngine.cancelSalesOrder(ORG, staleCounter.id, ACTOR, 'Ignore stale counter'))
        .rejects.toThrow(/existing invoiced balance/i);

      const fulfilled = await SalesEngine.createSalesOrder(ORG, { customerId: CUST, orderDate: '2026-04-05', totalAmount: 1000, status: 'CONFIRMED', lineItems: [{ description: 'Fulfilled then billed', quantity: 1, unitPrice: 1000, taxRate: 0 }] }, undefined, ACTOR);
      await SalesEngine.fulfillSalesOrder(ORG, fulfilled.id, ACTOR, { fulfilledAmount: 500 });
      const linkedInvoice = await SalesEngine.createAndPostInvoice(ORG, { salesOrderId: fulfilled.id, customerId: CUST, issueDate: '2026-04-05', dueDate: '2026-05-05', status: 'POSTED', lineItems: [{ description: 'Partial invoice', quantity: 1, unitPrice: 100, taxRate: 0 }] }, ACTOR);
      expect((await SalesEngine.getSalesOrder(ORG, fulfilled.id))?.status).toBe('PARTIALLY_INVOICED');
      await expect(SalesEngine.updateInvoice(ORG, linkedInvoice.id, { notes: 'must stay linked and balanced' }, ACTOR, '1'))
        .rejects.toThrow(/order-linked invoices cannot be edited/i);
      await FinancialDestructiveActionsService.voidInvoice(ORG, linkedInvoice.id, ACTOR, 'Correct linked invoice');
      expect((await SalesEngine.getSalesOrder(ORG, fulfilled.id))?.status).toBe('PARTIALLY_FULFILLED');
      await expect(SalesEngine.cancelSalesOrder(ORG, fulfilled.id, ACTOR, 'Delivery remains active'))
        .rejects.toThrow(/active deliveries/i);

      await expect(SalesEngine.fulfillSalesOrder(ORG, fulfilled.id, ACTOR, { fulfilledAmount: 500.001 }))
        .rejects.toThrow(/no fractional cents/i);
      await expect(SalesEngine.fulfillSalesOrder(ORG, fulfilled.id, ACTOR, { fulfilledAmount: 501 }))
        .rejects.toThrow(/exceeds the remaining unfulfilled sales order balance/i);
      const conversionAmountGuard = await SalesEngine.createSalesOrder(ORG, { customerId: CUST, orderDate: '2026-04-05', totalAmount: 400, status: 'CONFIRMED', lineItems: [{ description: 'Invalid conversion amount', quantity: 1, unitPrice: 400, taxRate: 0 }] }, undefined, ACTOR);
      const invoiceCountBeforeInvalidConversion = await db.query(`SELECT COUNT(*)::int AS count FROM invoices WHERE organization_id = $1 AND sales_order_id = $2`, [ORG, conversionAmountGuard.id]);
      const journalCountBeforeInvalidConversion = await db.query(`SELECT COUNT(*)::int AS count FROM journal_entries WHERE organization_id = $1`, [ORG]);
      for (const invalidAmount of [0, 0.005, Number.NaN]) {
        await expect(SalesEngine.convertSalesOrderToInvoice(ORG, conversionAmountGuard.id, ACTOR, invalidAmount))
          .rejects.toThrow(/greater than zero|no fractional cents/i);
      }
      const invoiceCountAfterInvalidConversion = await db.query(`SELECT COUNT(*)::int AS count FROM invoices WHERE organization_id = $1 AND sales_order_id = $2`, [ORG, conversionAmountGuard.id]);
      const journalCountAfterInvalidConversion = await db.query(`SELECT COUNT(*)::int AS count FROM journal_entries WHERE organization_id = $1`, [ORG]);
      const guardedOrderState = await SalesEngine.getSalesOrder(ORG, conversionAmountGuard.id);
      expect(invoiceCountAfterInvalidConversion.rows[0].count).toBe(invoiceCountBeforeInvalidConversion.rows[0].count);
      expect(journalCountAfterInvalidConversion.rows[0].count).toBe(journalCountBeforeInvalidConversion.rows[0].count);
      expect(guardedOrderState?.invoicedAmount).toBe(0);
      const taxedOrder = await SalesEngine.createSalesOrder(ORG, { customerId: CUST, orderDate: '2026-04-05', totalAmount: 1180, status: 'CONFIRMED', lineItems: [{ description: 'GST-bearing order', quantity: 1, unitPrice: 1000, taxRate: 18 }] }, undefined, ACTOR);
      const taxedInvoiceCountBefore = await db.query(`SELECT COUNT(*)::int AS count FROM invoices WHERE organization_id = $1 AND sales_order_id = $2`, [ORG, taxedOrder.id]);
      await expect(SalesEngine.convertSalesOrderToInvoice(ORG, taxedOrder.id, ACTOR, undefined, [{ description: 'Forged zero-tax line', quantity: 1, unitPrice: 1180, taxRate: 0 }]))
        .rejects.toThrow(/caller-supplied line items cannot override/i);      await expect(SalesEngine.convertSalesOrderToInvoice(ORG, taxedOrder.id, ACTOR, 590))
        .rejects.toThrow(/GST-bearing sales order/i);
      expect((await SalesEngine.getSalesOrder(ORG, taxedOrder.id))?.invoicedAmount).toBe(0);
      expect((await db.query(`SELECT COUNT(*)::int AS count FROM invoices WHERE organization_id = $1 AND sales_order_id = $2`, [ORG, taxedOrder.id])).rows[0].count).toBe(taxedInvoiceCountBefore.rows[0].count);
      const taxedInvoice = await SalesEngine.convertSalesOrderToInvoice(ORG, taxedOrder.id, ACTOR);
      expect(taxedInvoice.invoice.totalAmount).toBe(1180);
      expect(taxedInvoice.invoice.taxTotal).toBe(180);
      const outputTax = await db.query(`SELECT SUM(jl.credit) AS credit FROM journal_lines jl JOIN accounts a ON a.organization_id = jl.organization_id AND a.id = jl.account_id WHERE jl.organization_id = $1 AND jl.journal_entry_id = $2 AND a.code = '2200'`, [ORG, taxedInvoice.invoice.journalEntryId]);
      expect(Number(outputTax.rows[0].credit)).toBe(180);
      const discountedOrder = await SalesEngine.createSalesOrder(ORG, { customerId: CUST, orderDate: '2026-04-05', totalAmount: 1062, discount: 100, status: 'CONFIRMED', lineItems: [{ description: 'Discounted GST order', quantity: 1, unitPrice: 1000, taxRate: 18 }] }, undefined, ACTOR);
      const discountedInvoice = await SalesEngine.convertSalesOrderToInvoice(ORG, discountedOrder.id, ACTOR);
      expect(discountedInvoice.invoice.subtotal).toBe(1000);
      expect(discountedInvoice.invoice.discount).toBe(100);
      expect(discountedInvoice.invoice.taxTotal).toBe(162);
      expect(discountedInvoice.invoice.roundOffAmount).toBe(0);
      expect(discountedInvoice.invoice.totalAmount).toBe(1062);
      const invoiceFirst = await SalesEngine.createSalesOrder(ORG, { customerId: CUST, orderDate: '2026-04-06', totalAmount: 1000, status: 'CONFIRMED', lineItems: [{ description: 'Invoice before shipment', quantity: 1, unitPrice: 1000, taxRate: 0 }] }, undefined, ACTOR);
      await SalesEngine.createAndPostInvoice(ORG, { salesOrderId: invoiceFirst.id, customerId: CUST, issueDate: '2026-04-06', dueDate: '2026-05-06', status: 'POSTED', lineItems: [{ description: 'Partial invoice', quantity: 1, unitPrice: 200, taxRate: 0 }] }, ACTOR);
      await SalesEngine.fulfillSalesOrder(ORG, invoiceFirst.id, ACTOR, { fulfilledAmount: 300 });
      expect((await SalesEngine.getSalesOrder(ORG, invoiceFirst.id))?.status).toBe('PARTIALLY_INVOICED');
      await SalesEngine.fulfillSalesOrder(ORG, invoiceFirst.id, ACTOR, { fulfilledAmount: 700 });
      expect((await SalesEngine.getSalesOrder(ORG, invoiceFirst.id))?.status).toBe('PARTIALLY_INVOICED');

      const fullyInvoicedFirst = await SalesEngine.createSalesOrder(ORG, { customerId: CUST, orderDate: '2026-04-07', totalAmount: 700, status: 'CONFIRMED', lineItems: [{ description: 'Fully invoiced before shipment', quantity: 1, unitPrice: 700, taxRate: 0 }] }, undefined, ACTOR);
      await SalesEngine.createAndPostInvoice(ORG, { salesOrderId: fullyInvoicedFirst.id, customerId: CUST, issueDate: '2026-04-07', dueDate: '2026-05-07', status: 'POSTED', lineItems: [{ description: 'Full invoice', quantity: 1, unitPrice: 700, taxRate: 0 }] }, ACTOR);
      await SalesEngine.fulfillSalesOrder(ORG, fullyInvoicedFirst.id, ACTOR, { fulfilledAmount: 700 });
      expect((await SalesEngine.getSalesOrder(ORG, fullyInvoicedFirst.id))?.status).toBe('INVOICED');
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
