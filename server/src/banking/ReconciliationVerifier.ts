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
    | 'DUPLICATE_FINGERPRINT'
    | 'VERIFICATION_QUERY_FAILED';
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
    const recordFailure = (check: string, error: unknown): void => {
      const message = error instanceof Error ? error.message : 'Unknown database verification failure';
      console.error(`[ReconciliationVerifier] ${check} failed`, error);
      anomalies.push({
        type: 'VERIFICATION_QUERY_FAILED',
        severity: 'CRITICAL',
        organizationId: orgId || 'ALL_ORGANIZATIONS',
        recordId: check,
        details: `${check} could not be verified: ${message}`,
      });
    };

    // 1. Matched amount exceeds transaction amount
    try {
      let q1 = `
        SELECT t.id, t.organization_id, t.amount, m.matched_amount
        FROM bank_statement_transactions t
        JOIN bank_reconciliation_matches m ON t.id = m.statement_transaction_id
        WHERE m.status = 'MATCHED'
      `;
      const p1: any[] = [];
      if (orgId) {
        q1 += ` AND t.organization_id = $1`;
        p1.push(orgId);
      }
      const res1 = await db.query<any>(q1, p1);
      const matchedByTransaction = new Map<string, { organizationId: string; amount: number; totalMatched: number }>();
      for (const row of res1.rows || []) {
        const existing = matchedByTransaction.get(row.id) || {
          organizationId: row.organization_id,
          amount: Number(row.amount),
          totalMatched: 0,
        };
        existing.totalMatched += Number(row.matched_amount || 0);
        matchedByTransaction.set(row.id, existing);
      }
      for (const [transactionId, totals] of matchedByTransaction) {
        if (totals.totalMatched > totals.amount + 0.001) {
          anomalies.push({
            type: 'MATCHED_AMOUNT_EXCEEDS_TRANSACTION',
            severity: 'CRITICAL',
            organizationId: totals.organizationId,
            recordId: transactionId,
            details: `Total matched amount (${totals.totalMatched}) exceeds transaction amount (${totals.amount}).`,
          });
        }
      }
    } catch (error) { recordFailure('matched-amount-check', error); }

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
    } catch (error) { recordFailure('orphan-match-check', error); }

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
    } catch (error) { recordFailure('cross-organization-check', error); }

    // 4. Duplicate active matches for same transaction & accounting document
    try {
      let q4 = `
        SELECT organization_id, statement_transaction_id, accounting_transaction_id
        FROM bank_reconciliation_matches
        WHERE status = 'MATCHED'
      `;
      const p4: any[] = [];
      if (orgId) {
        q4 += ` AND organization_id = $1`;
        p4.push(orgId);
      }
      const res4 = await db.query<any>(q4, p4);
      const activeMatchCounts = new Map<string, { organizationId: string; statementId: string; accountingId: string; count: number }>();
      for (const row of res4.rows || []) {
        const key = `${row.organization_id}\u0000${row.statement_transaction_id}\u0000${row.accounting_transaction_id}`;
        const existing = activeMatchCounts.get(key) || {
          organizationId: row.organization_id,
          statementId: row.statement_transaction_id,
          accountingId: row.accounting_transaction_id,
          count: 0,
        };
        existing.count += 1;
        activeMatchCounts.set(key, existing);
      }
      for (const match of activeMatchCounts.values()) {
        if (match.count > 1) {
          anomalies.push({
            type: 'DUPLICATE_ACTIVE_MATCH',
            severity: 'CRITICAL',
            organizationId: match.organizationId,
            recordId: `${match.statementId}:${match.accountingId}`,
            details: `Found ${match.count} active duplicate matches for statement tx ${match.statementId}.`,
          });
        }
      }
    } catch (error) { recordFailure('duplicate-match-check', error); }

    // 5. Completed reconciliation session with non-zero difference
    try {
      let q5 = `
        SELECT id, organization_id, difference
        FROM bank_reconciliation_sessions
        WHERE status = 'COMPLETED' AND (difference > 0.01 OR difference < -0.01)
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
    } catch (error) { recordFailure('completed-session-check', error); }

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
    } catch (error) { recordFailure('reconciled-allocation-check', error); }

    // 7. Duplicate fingerprints
    try {
      let q7 = `
        SELECT organization_id, fingerprint
        FROM bank_statement_transactions
      `;
      const p7: any[] = [];
      if (orgId) {
        q7 += ` WHERE organization_id = $1`;
        p7.push(orgId);
      }
      const res7 = await db.query<any>(q7, p7);
      const fingerprintCounts = new Map<string, { organizationId: string; fingerprint: string; count: number }>();
      for (const row of res7.rows || []) {
        const key = `${row.organization_id}\u0000${row.fingerprint}`;
        const existing = fingerprintCounts.get(key) || {
          organizationId: row.organization_id,
          fingerprint: row.fingerprint,
          count: 0,
        };
        existing.count += 1;
        fingerprintCounts.set(key, existing);
      }
      for (const fingerprint of fingerprintCounts.values()) {
        if (fingerprint.count > 1) {
          anomalies.push({
            type: 'DUPLICATE_FINGERPRINT',
            severity: 'WARNING',
            organizationId: fingerprint.organizationId,
            recordId: fingerprint.fingerprint,
            details: `Fingerprint ${fingerprint.fingerprint} appears ${fingerprint.count} times in organization ${fingerprint.organizationId}.`,
          });
        }
      }
    } catch (error) { recordFailure('duplicate-fingerprint-check', error); }

    // Summary counts
    let totalTransactions = 0;
    let totalMatches = 0;
    let totalSessions = 0;

    try {
      const countFilter = orgId ? ' WHERE organization_id = $1' : '';
      const countParams = orgId ? [orgId] : [];
      const txRes = await db.query<any>(`SELECT COUNT(*) as cnt FROM bank_statement_transactions${countFilter}`, countParams);
      totalTransactions = parseInt(txRes.rows?.[0]?.cnt || 0, 10);

      const mRes = await db.query<any>(`SELECT COUNT(*) as cnt FROM bank_reconciliation_matches${countFilter}`, countParams);
      totalMatches = parseInt(mRes.rows?.[0]?.cnt || 0, 10);

      const sRes = await db.query<any>(`SELECT COUNT(*) as cnt FROM bank_reconciliation_sessions${countFilter}`, countParams);
      totalSessions = parseInt(sRes.rows?.[0]?.cnt || 0, 10);
    } catch (error) { recordFailure('reconciliation-summary-counts', error); }

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
