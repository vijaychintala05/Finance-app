import crypto from 'crypto';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { BankStatementTransaction } from '../../../src/types/banking';
import { BankRulesEngine } from './BankRulesEngine';

export interface FeedTransaction {
  externalId: string;
  transactionDate: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  narration: string;
  reference?: string;
  runningBalance?: number;
  valueDate?: string;
  utr?: string;
  counterpartyName?: string;
  rawData?: any;
}

export interface BankFeedConnection {
  id: string;
  organizationId: string;
  bankAccountId: string;
  provider: string;
  connectionStatus: 'ACTIVE' | 'DISCONNECTED' | 'ERROR';
  lastSyncAt?: string | null;
  lastSyncCursor?: string | null;
  credentialsEncrypted?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankFeedProvider {
  name: string;
  fetchTransactions(
    connection: BankFeedConnection,
    cursor?: string | null
  ): Promise<{
    transactions: FeedTransaction[];
    nextCursor?: string;
    hasMore: boolean;
  }>;
}

// In-memory mock feed data store for testing and simulation
const mockFeedStore = new Map<string, FeedTransaction[]>();

export class MockBankFeedProvider implements BankFeedProvider {
  public name = 'mock';

  public static seedFeed(bankAccountId: string, transactions: FeedTransaction[]) {
    mockFeedStore.set(bankAccountId, transactions);
  }

  public static clear() {
    mockFeedStore.clear();
  }

  public async fetchTransactions(
    connection: BankFeedConnection,
    cursor?: string | null
  ): Promise<{ transactions: FeedTransaction[]; nextCursor?: string; hasMore: boolean }> {
    const all = mockFeedStore.get(connection.bankAccountId) || [];
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const slice = all.slice(startIndex, startIndex + 20);
    const nextIndex = startIndex + slice.length;
    const hasMore = nextIndex < all.length;

    return {
      transactions: slice,
      nextCursor: hasMore ? String(nextIndex) : undefined,
      hasMore,
    };
  }
}

export class BankFeedSyncService {
  private static providers = new Map<string, BankFeedProvider>([
    ['mock', new MockBankFeedProvider()],
  ]);

  public static registerProvider(provider: BankFeedProvider) {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  private static getEncryptionKey(): Buffer {
    const rawKey = process.env.APP_ENCRYPTION_KEY;
    if (!rawKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('APP_ENCRYPTION_KEY environment variable is required in production');
      }
    }
    return crypto.createHash('sha256').update(rawKey || 'firmbooks-bank-feed-encryption-2026').digest();
  }

  public static encryptCredentials(credentials: any): string {
    const raw = JSON.stringify(credentials);
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(raw, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return JSON.stringify({
      iv: iv.toString('hex'),
      data: encrypted,
      tag: authTag,
    });
  }

  public static decryptCredentials(encryptedString: string): any {
    try {
      const parsed = JSON.parse(encryptedString);
      if (!parsed.iv || !parsed.data || !parsed.tag) return JSON.parse(encryptedString);
      const key = this.getEncryptionKey();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(parsed.tag, 'hex'));
      let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }

  public static async connectFeed(
    orgId: string,
    bankAccountId: string,
    providerName: string,
    credentials?: any
  ): Promise<BankFeedConnection> {
    const id = newId('bf-conn');
    const encryptedCreds = credentials ? this.encryptCredentials(credentials) : null;

    const res = await db.query(
      `INSERT INTO bank_feed_connections (
         id, organization_id, bank_account_id, provider, connection_status, credentials_encrypted
       ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5)
       ON CONFLICT (organization_id, bank_account_id, provider)
       DO UPDATE SET connection_status = 'ACTIVE', credentials_encrypted = EXCLUDED.credentials_encrypted, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [id, orgId, bankAccountId, providerName.toLowerCase(), encryptedCreds]
    );

    return this.mapRow(res.rows[0]);
  }

  public static async getFeedConnection(orgId: string, bankAccountId: string): Promise<BankFeedConnection | null> {
    const res = await db.query(
      `SELECT * FROM bank_feed_connections
       WHERE organization_id = $1 AND bank_account_id = $2 AND connection_status = 'ACTIVE'
       LIMIT 1`,
      [orgId, bankAccountId]
    );
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public static async syncFeed(
    orgId: string,
    bankAccountId: string,
    providerName?: string
  ): Promise<{
    syncedCount: number;
    duplicateCount: number;
    nextCursor?: string;
    transactions: BankStatementTransaction[];
  }> {
    let connection = await this.getFeedConnection(orgId, bankAccountId);
    if (!connection && providerName) {
      connection = await this.connectFeed(orgId, bankAccountId, providerName);
    }
    if (!connection) {
      throw new Error(`No active bank feed connection found for bank account ${bankAccountId}`);
    }

    const provider = this.providers.get(connection.provider.toLowerCase());
    if (!provider) {
      throw new Error(`Unsupported bank feed provider: ${connection.provider}`);
    }

    // Fetch from provider starting from cursor
    const result = await provider.fetchTransactions(connection, connection.lastSyncCursor);

    // Get currency of the bank account
    const accRes = await db.query(
      `SELECT currency FROM bank_accounts WHERE organization_id = $1 AND id = $2`,
      [orgId, bankAccountId]
    );
    const currency = accRes.rows[0]?.currency || 'INR';

    // Existing fingerprints to guarantee duplicate-safety
    const existingRes = await db.query(
      `SELECT fingerprint FROM bank_statement_transactions WHERE organization_id = $1 AND bank_account_id = $2`,
      [orgId, bankAccountId]
    );
    const existingFingerprints = new Set<string>(existingRes.rows.map((r: any) => r.fingerprint));

    let syncedCount = 0;
    let duplicateCount = 0;
    const insertedList: BankStatementTransaction[] = [];

    // Rules for auto-categorization
    const rulesRes = await db.query(
      `SELECT * FROM bank_reconciliation_rules WHERE organization_id = $1 AND is_enabled = TRUE`,
      [orgId]
    );
    const rules = rulesRes.rows.map((r: any) => ({
      id: r.id,
      organizationId: r.organization_id,
      ruleName: r.rule_name,
      priority: Number(r.priority || 1),
      direction: r.direction,
      narrationPattern: r.narration_pattern,
      suggestedCategory: r.suggested_category,
      suggestedAccountId: r.suggested_account_id,
      isEnabled: r.is_enabled,
      createdAt: r.created_at,
    }));

    for (const tx of result.transactions) {
      // Deterministic fingerprint
      const fpString = `${bankAccountId}:${tx.transactionDate}:${tx.amount}:${tx.direction}:${tx.reference || ''}:${tx.narration.trim()}`;
      const fingerprint = crypto.createHash('sha256').update(fpString).digest('hex');

      if (existingFingerprints.has(fingerprint)) {
        duplicateCount++;
        continue;
      }

      const txId = newId('btx');
      const statementTx: BankStatementTransaction = {
        id: txId,
        organizationId: orgId,
        bankAccountId,
        statementImportId: `feed-${connection.id}`,
        transactionDate: tx.transactionDate,
        valueDate: tx.valueDate || tx.transactionDate,
        amount: tx.amount,
        direction: tx.direction,
        runningBalance: tx.runningBalance,
        narration: tx.narration,
        reference: tx.reference,
        transactionType: 'BANK_FEED',
        utr: tx.utr,
        counterpartyName: tx.counterpartyName,
        currency,
        reconciliationStatus: 'UNMATCHED',
        fingerprint,
        rawData: tx.rawData || { externalId: tx.externalId, provider: connection.provider },
        createdAt: new Date().toISOString(),
      };

      // Evaluate rules
      const ruleMatch = BankRulesEngine.evaluateRules(statementTx, rules);
      if (ruleMatch) {
        statementTx.reconciliationStatus = 'SUGGESTED';
      }

      await db.query(
        `INSERT INTO bank_statement_transactions (
           id, organization_id, bank_account_id, statement_import_id, transaction_date, value_date,
           amount, direction, running_balance, narration, reference,
           transaction_type, utr, counterparty_name, currency,
           reconciliation_status, fingerprint, raw_data, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (organization_id, fingerprint) DO NOTHING`,
        [
          statementTx.id,
          orgId,
          bankAccountId,
          statementTx.statementImportId,
          statementTx.transactionDate,
          statementTx.valueDate,
          statementTx.amount,
          statementTx.direction,
          statementTx.runningBalance ?? null,
          statementTx.narration,
          statementTx.reference ?? null,
          statementTx.transactionType,
          statementTx.utr ?? null,
          statementTx.counterpartyName ?? null,
          currency,
          statementTx.reconciliationStatus,
          statementTx.fingerprint,
          JSON.stringify(statementTx.rawData),
          statementTx.createdAt,
        ]
      );

      existingFingerprints.add(fingerprint);
      insertedList.push(statementTx);
      syncedCount++;
    }

    // Update connection cursor and lastSyncAt
    await db.query(
      `UPDATE bank_feed_connections
       SET last_sync_at = CURRENT_TIMESTAMP,
           last_sync_cursor = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [result.nextCursor || null, connection.id]
    );

    return {
      syncedCount,
      duplicateCount,
      nextCursor: result.nextCursor,
      transactions: insertedList,
    };
  }

  private static mapRow(row: any): BankFeedConnection {
    return {
      id: row.id,
      organizationId: row.organization_id,
      bankAccountId: row.bank_account_id,
      provider: row.provider,
      connectionStatus: row.connection_status,
      lastSyncAt: row.last_sync_at ? (row.last_sync_at instanceof Date ? row.last_sync_at.toISOString() : String(row.last_sync_at)) : null,
      lastSyncCursor: row.last_sync_cursor || null,
      credentialsEncrypted: row.credentials_encrypted || null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}
