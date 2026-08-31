import { db } from '../database/db';
import type { QueryClient } from '../accounting/postingEngine';
import { newId } from '../utils/ids';

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
    GOODS_RECEIPT: 'GRN',
    VENDOR_BILL: 'BILL',
    EXPENSE: 'EXP',
    CREDIT_NOTE: 'CN',
    DEBIT_NOTE: 'DN',
    CUSTOMER_PAYMENT: 'PAY',
    CUSTOMER_REFUND: 'REF',
    VENDOR_PAYMENT: 'VPAY',
    DELIVERY_CHALLAN: 'DC',
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
    customPrefix?: string,
    transactionClient?: QueryClient
  ): Promise<string> {
    const docType = documentType.toUpperCase();
    const prefix = customPrefix || this.DEFAULT_PREFIXES[docType] || docType;
    const fy = this.getFinancialYear(dateStr);
    const seqId = newId('seq');

    // Upsert and increment atomically with transactional advisory lock
    const queryExecutor = transactionClient || db;
    if (!db.isMemoryMode()) {
      try {
        await queryExecutor.query(
          `SELECT pg_advisory_xact_lock(hashtext('firmbooks_doc_seq:' || $1 || ':' || $2 || ':' || $3))`,
          [organizationId, docType, fy]
        );
      } catch {
        // Safe fallback if advisory lock is not supported
      }
    }

    const res = await queryExecutor.query(
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

  /** Read-only display preview. Actual numbers are allocated only on creation. */
  public static async previewNextNumber(
    organizationId: string,
    documentType: string,
    dateStr?: string
  ): Promise<string> {
    const docType = documentType.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,49}$/.test(docType)) throw new Error('Invalid document type');
    if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Date must use YYYY-MM-DD format');
    const fy = this.getFinancialYear(dateStr);
    const res = await db.query(
      `SELECT prefix, suffix, next_number, padding_length
         FROM document_sequences
        WHERE organization_id = $1 AND document_type = $2 AND financial_year = $3`,
      [organizationId, docType, fy]
    );
    const row = res.rows[0] || {
      prefix: this.DEFAULT_PREFIXES[docType] || docType,
      suffix: '',
      next_number: 1,
      padding_length: 4,
    };
    const number = String(Number(row.next_number || 1)).padStart(Number(row.padding_length || 4), '0');
    return `${row.prefix}/${fy}/${number}${row.suffix ? `/${row.suffix}` : ''}`;
  }

  /**
   * Configure custom sequence parameters for an org & docType
   */
  public static async configureSequence(
    organizationId: string,
    config: SequenceConfig,
    userId?: string,
    transactionClient?: QueryClient
  ): Promise<any> {
    if (!config || typeof config.documentType !== 'string' || typeof config.prefix !== 'string') {
      throw new Error('Document type and prefix are required');
    }
    const docType = config.documentType.trim().toUpperCase();
    const prefix = config.prefix.trim();
    if (!/^[A-Z][A-Z0-9_]{1,49}$/.test(docType)) throw new Error('Invalid document type');
    if (!prefix || prefix.length > 20 || !/^[A-Za-z0-9._-]+$/.test(prefix)) throw new Error('Prefix must be 1-20 safe characters');
    const fy = config.financialYear || this.getFinancialYear();
    if (!/^\d{4}-\d{2}$/.test(fy)) throw new Error('Financial year must use YYYY-YY format');
    const seqId = newId('seq');
    const suffix = config.suffix || '';
    if (suffix.length > 20 || (suffix && !/^[A-Za-z0-9._-]+$/.test(suffix))) throw new Error('Suffix must contain no more than 20 safe characters');
    const padLen = config.paddingLength ?? 4;
    if (!Number.isInteger(padLen) || padLen < 2 || padLen > 12) throw new Error('Padding length must be an integer from 2 to 12');

    const persist = async (client: QueryClient) => {
      await client.query(
        `INSERT INTO document_sequences (id, organization_id, document_type, prefix, suffix, financial_year, next_number, padding_length)
         VALUES ($1, $2, $3, $4, $5, $6, 1, $7)
         ON CONFLICT (organization_id, document_type, financial_year)
         DO UPDATE SET prefix = $4, suffix = $5, padding_length = $7`,
        [seqId, organizationId, docType, prefix, suffix, fy, padLen]
      );
      if (userId) {
        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
           VALUES ($1, $2, $3, 'DOCUMENT_SEQUENCE_CONFIGURED', 'DocumentSequence', $4, $5)`,
          [newId('aud'), organizationId, userId, seqId, JSON.stringify({ documentType: docType, prefix, suffix, financialYear: fy, paddingLength: padLen })]
        );
      }
    };
    if (transactionClient) await persist(transactionClient);
    else await db.transaction(persist);

    return { organizationId, documentType: docType, prefix, suffix, financialYear: fy, paddingLength: padLen };
  }
}
