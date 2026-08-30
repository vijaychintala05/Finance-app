import { db } from '../database/db';
import { databaseMoney } from '../utils/money';
import { AccountingIntegrityService } from './AccountingIntegrityService';

export interface GSTReturnSummary {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  outward: { documentCount: number; taxableValue: number; taxAmount: number; missingGstinCount: number };
  inward: { documentCount: number; taxableValue: number; taxAmount: number; missingGstinCount: number };
  netTaxPosition: number;
  integrity: { isBalanced: boolean; difference: number };
  readiness: Array<{ code: string; passed: boolean; message: string }>;
}

const periodDates = (periodKey: string) => {
  if (!/^\d{4}-\d{2}$/.test(periodKey)) throw new Error('GST_PERIOD_INVALID: period must use YYYY-MM');
  const [year, month] = periodKey.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 0));
  if (end.getUTCFullYear() !== year || end.getUTCMonth() !== month - 1) throw new Error('GST_PERIOD_INVALID: period must use a valid calendar month');
  return { periodStart: `${periodKey}-01`, periodEnd: `${periodKey}-${String(end.getUTCDate()).padStart(2, '0')}` };
};

export class GSTComplianceService {
  public static async getReturnSummary(organizationId: string, requestedPeriod?: string): Promise<GSTReturnSummary> {
    const periodKey = requestedPeriod || new Date().toISOString().slice(0, 7);
    const { periodStart, periodEnd } = periodDates(periodKey);
    const [outwardRes, inwardRes, integrity] = await Promise.all([
      db.query(`SELECT COUNT(*) AS document_count, COALESCE(SUM(i.subtotal), 0) AS taxable_value, COALESCE(SUM(i.tax_total), 0) AS tax_amount,
          COALESCE(SUM(CASE WHEN c.tax_id IS NULL OR c.tax_id = '' THEN 1 ELSE 0 END), 0) AS missing_gstin_count
        FROM invoices i LEFT JOIN clients c ON c.id = i.client_id AND c.organization_id = i.organization_id
        WHERE i.organization_id = $1 AND i.issue_date >= $2 AND i.issue_date <= $3 AND UPPER(i.status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`, [organizationId, periodStart, periodEnd]),
      db.query(`SELECT COUNT(*) AS document_count, COALESCE(SUM(subtotal), 0) AS taxable_value, COALESCE(SUM(tax_total), 0) AS tax_amount
        FROM bills WHERE organization_id = $1 AND bill_date >= $2 AND bill_date <= $3 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`, [organizationId, periodStart, periodEnd]),
      AccountingIntegrityService.verifyGSTIntegrity(organizationId),
    ]);
    const outward = outwardRes.rows[0] || {};
    const inward = inwardRes.rows[0] || {};
    const outputTax = databaseMoney(outward.tax_amount, 'GST outward tax');
    const inputTax = databaseMoney(inward.tax_amount, 'GST input tax');
    const missingCustomerGstin = Number(outward.missing_gstin_count || 0);
    const missingVendorGstin = 0;
    const integrityDifference = databaseMoney(integrity.difference, 'GST integrity difference');
    return {
      periodKey, periodStart, periodEnd,
      outward: { documentCount: Number(outward.document_count || 0), taxableValue: databaseMoney(outward.taxable_value, 'GST outward taxable value'), taxAmount: outputTax, missingGstinCount: missingCustomerGstin },
      inward: { documentCount: Number(inward.document_count || 0), taxableValue: databaseMoney(inward.taxable_value, 'GST inward taxable value'), taxAmount: inputTax, missingGstinCount: missingVendorGstin },
      netTaxPosition: outputTax - inputTax,
      integrity: { isBalanced: integrity.isBalanced, difference: integrityDifference },
      readiness: [
        { code: 'GST_CONTROL', passed: integrity.isBalanced, message: integrity.isBalanced ? 'GST document tax totals reconcile with the configured control accounts.' : 'GST control accounts do not reconcile. Resolve this before return preparation.' },
        { code: 'CUSTOMER_GSTIN', passed: missingCustomerGstin === 0, message: missingCustomerGstin === 0 ? 'All posted outward documents have a customer GSTIN where tracked.' : `${missingCustomerGstin} outward documents are missing a customer GSTIN.` },
        { code: 'VENDOR_GSTIN', passed: false, message: 'Vendor GSTIN evidence is not yet stored in the vendor master. Add that data model before GSTR-3B preparation.' },
        { code: 'FILING', passed: false, message: 'Return filing remains manual until a GST portal/ASP integration and accountant approval are configured.' },
      ],
    };
  }
}
