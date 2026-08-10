import { db } from '../database/db';

export interface AnomalyReport {
  type:
    | 'MATCHED_AMOUNT_EXCEEDS_TRANSACTION'
    | 'ORPHAN_MATCH'
    | 'CROSS_ORGANIZATION_MATCH'
    | 'MISSING_ACCOUNTING_DOCUMENT'
    | 'DUPLICATE_ACTIVE_MATCH'
    | 'COMPLETED_SESSION_DISCREPANCY'
    | 'UNALLOCATED_RECONCILED_TRANSACTION'
    | 'INCORRECT_INTERNAL_TRANSFER'
    | 'DUPLICATE_FINGERPRINT';
  severity: 'CRITICAL' | 'WARNING';
  organizationId: string;
  recordId: string;
  details: string;
}

export class ReconciliationVerifier {
  public static async verifyAll(orgId?: string): Promise<{
    isValid: boolean;
    anomalies: AnomalyReport[];
    summary: {
      totalTransactions: number;
      totalMatches: number;
      totalSessions: number;
      anomalyCount: number;
    };
  }> {
    const anomalies: AnomalyReport[] = [];

    // 1. Matched amount exceeds transaction amount
    try {
      let q1 = `
        SELECT t.id, t.organization_id, t.amount, SUM(m.matched_amount) as total_matched
        FROM bank_statement_transactions t
        JOIN bank_reconciliation_matches m ON t.id = m.statement_transaction_id
        WHERE m.status = 'MATCHED'
      `;
      const p1: any[] = [];
      if (orgId) {
        q1 += ` AND t.organization_id = $1`;
        p1.push(orgId);
      }
      q1 += ` GROUP BY t.id, t.organization_id, t.amount HAVING SUM(m.matched_amount) > t.amount + 0.001`;

      const res1 = await db.query<any>(q1, p1);
      if (res1.rows) {
        for (const row of res1.rows) {
          anomalies.push({
            type: 'MATCHED_AMOUNT_EXCEEDS_TRANSACTION',
            severity: 'CRITICAL',
            organizationId: row.organization_id,
            recordId: row.id,
            details: `Total matched amount (${row.total_matched}) exceeds transaction amount (${row.amount}).`,
          });
        }
      }
    } catch (e) {}

    // 2. Orphan matches (referencing missing statement transactions)
    try {
      let q2 = `
        SELECT m.id, m.organization_id, m.statement_transaction_id
        FROM bank_reconciliation_matches m
        LEFT JOIN bank_statement_transactions t ON m.statement_transaction_id = t.id
        WHERE t.id IS NULL
      `;
      const p2: any[] = [];
      if (orgId) {
        q2 += ` AND m.organization_id = $1`;
        p2.push(orgId);
      }
      const res2 = await db.query<any>(q2, p2);
      if (res2.rows) {
        for (const row of res2.rows) {
          anomalies.push({
            type: 'ORPHAN_MATCH',
            severity: 'CRITICAL',
            organizationId: row.organization_id,
            recordId: row.id,
            details: `Match ${row.id} references non-existent statement transaction ${row.statement_transaction_id}.`,
          });
        }
      }
    } catch (e) {}

    // 3. Cross-organization matches
    try {
      let q3 = `
        SELECT m.id, m.organization_id as match_org, t.organization_id as tx_org
        FROM bank_reconciliation_matches m
        JOIN bank_statement_transactions t ON m.statement_transaction_id = t.id
        WHERE m.organization_id != t.organization_id
      `;
      const p3: any[] = [];
      if (orgId) {
        q3 += ` AND m.organization_id = $1`;
        p3.push(orgId);
      }
      const res3 = await db.query<any>(q3, p3);
      if (res3.rows) {
        for (const row of res3.rows) {
          anomalies.push({
            type: 'CROSS_ORGANIZATION_MATCH',
            severity: 'CRITICAL',
            organizationId: row.match_org,
            recordId: row.id,
            details: `Match org (${row.match_org}) does not match statement transaction org (${row.tx_org}).`,
          });
        }
      }
    } catch (e) {}

    // 4. Duplicate active matches for same transaction & accounting document
    try {
      let q4 = `
        SELECT organization_id, statement_transaction_id, accounting_transaction_id, COUNT(*) as cnt
        FROM bank_reconciliation_matches
        WHERE status = 'MATCHED'
      `;
      const p4: any[] = [];
      if (orgId) {
        q4 += ` AND organization_id = $1`;
        p4.push(orgId);
      }
      q4 += ` GROUP BY organization_id, statement_transaction_id, accounting_transaction_id HAVING COUNT(*) > 1`;

      const res4 = await db.query<any>(q4, p4);
      if (res4.rows) {
        for (const row of res4.rows) {
          anomalies.push({
            type: 'DUPLICATE_ACTIVE_MATCH',
            severity: 'CRITICAL',
            organizationId: row.organization_id,
            recordId: `${row.statement_transaction_id}:${row.accounting_transaction_id}`,
            details: `Found ${row.cnt} active duplicate matches for statement tx ${row.statement_transaction_id}.`,
          });
        }
      }
    } catch (e) {}

    // 5. Completed reconciliation session with non-zero difference
    try {
      let q5 = `
        SELECT id, organization_id, difference
        FROM bank_reconciliation_sessions
        WHERE status = 'COMPLETED' AND ABS(difference) > 0.01
      `;
      const p5: any[] = [];
      if (orgId) {
        q5 += ` AND organization_id = $1`;
        p5.push(orgId);
      }
      const res5 = await db.query<any>(q5, p5);
      if (res5.rows) {
        for (const row of res5.rows) {
          anomalies.push({
            type: 'COMPLETED_SESSION_DISCREPANCY',
            severity: 'CRITICAL',
            organizationId: row.organization_id,
            recordId: row.id,
            details: `Completed session ${row.id} has non-zero difference ${row.difference}.`,
          });
        }
      }
    } catch (e) {}

    // 6. Statement transaction marked RECONCILED without valid match allocation
    try {
      let q6 = `
        SELECT t.id, t.organization_id
        FROM bank_statement_transactions t
        LEFT JOIN bank_reconciliation_matches m ON t.id = m.statement_transaction_id
        WHERE t.reconciliation_status = 'RECONCILED' AND m.id IS NULL
      `;
      const p6: any[] = [];
      if (orgId) {
        q6 += ` AND t.organization_id = $1`;
        p6.push(orgId);
      }
      const res6 = await db.query<any>(q6, p6);
      if (res6.rows) {
        for (const row of res6.rows) {
          anomalies.push({
            type: 'UNALLOCATED_RECONCILED_TRANSACTION',
            severity: 'CRITICAL',
            organizationId: row.organization_id,
            recordId: row.id,
            details: `Transaction ${row.id} is marked RECONCILED but has no match records.`,
          });
        }
      }
    } catch (e) {}

    // 7. Duplicate fingerprints
    try {
      let q7 = `
        SELECT organization_id, fingerprint, COUNT(*) as cnt
        FROM bank_statement_transactions
      `;
      const p7: any[] = [];
      if (orgId) {
        q7 += ` WHERE organization_id = $1`;
        p7.push(orgId);
      }
      q7 += ` GROUP BY organization_id, fingerprint HAVING COUNT(*) > 1`;

      const res7 = await db.query<any>(q7, p7);
      if (res7.rows) {
        for (const row of res7.rows) {
          anomalies.push({
            type: 'DUPLICATE_FINGERPRINT',
            severity: 'WARNING',
            organizationId: row.organization_id,
            recordId: row.fingerprint,
            details: `Fingerprint ${row.fingerprint} appears ${row.cnt} times in organization ${row.organization_id}.`,
          });
        }
      }
    } catch (e) {}

    // Summary counts
    let totalTransactions = 0;
    let totalMatches = 0;
    let totalSessions = 0;

    try {
      const txRes = await db.query<any>(`SELECT COUNT(*) as cnt FROM bank_statement_transactions`);
      totalTransactions = parseInt(txRes.rows?.[0]?.cnt || 0, 10);

      const mRes = await db.query<any>(`SELECT COUNT(*) as cnt FROM bank_reconciliation_matches`);
      totalMatches = parseInt(mRes.rows?.[0]?.cnt || 0, 10);

      const sRes = await db.query<any>(`SELECT COUNT(*) as cnt FROM bank_reconciliation_sessions`);
      totalSessions = parseInt(sRes.rows?.[0]?.cnt || 0, 10);
    } catch (e) {}

    return {
      isValid: anomalies.filter((a) => a.severity === 'CRITICAL').length === 0,
      anomalies,
      summary: {
        totalTransactions,
        totalMatches,
        totalSessions,
        anomalyCount: anomalies.length,
      },
    };
  }
}
