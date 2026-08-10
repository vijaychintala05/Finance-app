import { db } from '../database/db';

export interface SequenceConfig {
  documentType: string;
  prefix: string;
  suffix?: string;
  financialYear?: string;
  paddingLength?: number;
}

export class DocumentNumberingEngine {
  private static DEFAULT_PREFIXES: Record<string, string> = {
    QUOTATION: 'QT',
    ESTIMATE: 'QT',
    INVOICE: 'INV',
    SALES_ORDER: 'SO',
    PURCHASE_ORDER: 'PO',
    VENDOR_BILL: 'BILL',
    CREDIT_NOTE: 'CN',
    DEBIT_NOTE: 'DN',
    CUSTOMER_PAYMENT: 'PAY',
    VENDOR_PAYMENT: 'VPAY',
    JOURNAL: 'JV',
  };

  /**
   * Returns current financial year string in format e.g. "2026-27"
   * Assumes standard April 1 - March 31 fiscal year if month >= April
   */
  public static getFinancialYear(dateStr?: string): string {
    const date = dateStr ? new Date(dateStr) : new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1 - 12

    if (month >= 4) {
      const nextYr = (year + 1) % 100;
      return `${year}-${nextYr < 10 ? '0' + nextYr : nextYr}`;
    } else {
      const prevYr = year - 1;
      const curYr = year % 100;
      return `${prevYr}-${curYr < 10 ? '0' + curYr : curYr}`;
    }
  }

  /**
   * Generates next concurrency-safe document number for an organization
   */
  public static async getNextNumber(
    organizationId: string,
    documentType: string,
    dateStr?: string,
    customPrefix?: string
  ): Promise<string> {
    const docType = documentType.toUpperCase();
    const prefix = customPrefix || this.DEFAULT_PREFIXES[docType] || docType;
    const fy = this.getFinancialYear(dateStr);
    const seqId = `seq-${organizationId}-${docType}-${fy}`;

    // Upsert and increment atomically
    const res = await db.query(
      `INSERT INTO document_sequences (id, organization_id, document_type, prefix, financial_year, next_number, padding_length)
       VALUES ($1, $2, $3, $4, $5, 2, 4)
       ON CONFLICT (organization_id, document_type, financial_year)
       DO UPDATE SET next_number = document_sequences.next_number + 1
       RETURNING prefix, suffix, financial_year, (document_sequences.next_number - 1) as current_seq, padding_length`,
      [seqId, organizationId, docType, prefix, fy]
    );

    const row = res.rows[0];
    const seqNum = row.current_seq;
    const padLen = row.padding_length || 4;
    const paddedSeq = String(seqNum).padStart(padLen, '0');
    const suffix = row.suffix ? `/${row.suffix}` : '';

    return `${row.prefix}/${row.financial_year}/${paddedSeq}${suffix}`;
  }

  /**
   * Configure custom sequence parameters for an org & docType
   */
  public static async configureSequence(
    organizationId: string,
    config: SequenceConfig
  ): Promise<any> {
    const docType = config.documentType.toUpperCase();
    const fy = config.financialYear || this.getFinancialYear();
    const seqId = `seq-${organizationId}-${docType}-${fy}`;
    const prefix = config.prefix;
    const suffix = config.suffix || '';
    const padLen = config.paddingLength || 4;

    await db.query(
      `INSERT INTO document_sequences (id, organization_id, document_type, prefix, suffix, financial_year, next_number, padding_length)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7)
       ON CONFLICT (organization_id, document_type, financial_year)
       DO UPDATE SET prefix = $4, suffix = $5, padding_length = $7`,
      [seqId, organizationId, docType, prefix, suffix, fy, padLen]
    );

    return { organizationId, documentType: docType, prefix, suffix, financialYear: fy, paddingLength: padLen };
  }
}
