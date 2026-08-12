import pg from 'pg';
import { newDb, IMemoryDb } from 'pg-mem';
import { AsyncLocalStorage } from 'node:async_hooks';

const { Pool } = pg;

export interface DbQueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DbQueryClient {
  query: <T = any>(text: string, params?: any[]) => Promise<DbQueryResult<T>>;
}

class DatabaseService {
  private pool: pg.Pool | null = null;
  private memoryStore: Map<string, any[]> = new Map();
  private isUsingMemoryFallback: boolean = false;
  private memDbInstance: IMemoryDb | null = null;
  private transactionContext = new AsyncLocalStorage<DbQueryClient>();
  private savepointSequence = 0;

  constructor() {
    this.initPool();
  }

  public isMemoryAllowed(): boolean {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return (
      process.env.NODE_ENV === 'test' ||
      process.env.DATABASE_MODE === 'memory' ||
      process.env.USE_PG_MEM === 'true' ||
      process.env.VITEST === 'true'
    );
  }

  public resetPool(): void {
    this.pool = null;
    this.memDbInstance = null;
    this.isUsingMemoryFallback = false;
    this.initPool();
  }

  public async checkHealth(): Promise<{ isConnected: boolean; isMemoryMode: boolean }> {
    try {
      await this.query('SELECT 1');
      return { isConnected: true, isMemoryMode: this.isMemoryMode() };
    } catch (e) {
      return { isConnected: false, isMemoryMode: false };
    }
  }

  public isMemoryMode(): boolean {
    return Boolean(this.memDbInstance) || this.isUsingMemoryFallback || !this.pool;
  }

  public initPgMem() {
    try {
      const memDb = newDb();
      memDb.public.registerFunction({
        name: 'now',
        returns: memDb.public.getType('timestamp' as any),
        implementation: () => new Date(),
      });
      memDb.public.registerFunction({
        name: 'current_timestamp',
        returns: memDb.public.getType('timestamp' as any),
        implementation: () => new Date(),
      });
      const { Pool: MemPool } = memDb.adapters.createPg();
      this.pool = new MemPool() as any;
      this.memDbInstance = memDb;
      this.isUsingMemoryFallback = false;
      return memDb;
    } catch (e) {
      console.error('Failed to init pg-mem:', e);
      if (this.isMemoryAllowed()) {
        this.isUsingMemoryFallback = true;
      } else {
        throw new Error(`Database connection unavailable: Failed to init pg-mem and production mode prohibits fallback.`);
      }
    }
  }

  private initPool() {
    const connectionString = process.env.DATABASE_URL;
    if (connectionString) {
      try {
        this.pool = new Pool({
          connectionString,
          max: Number(process.env.DB_POOL_MAX || 10),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
          query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 15000),
          statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15000),
          application_name: 'firmbooks-api',
          ssl: process.env.DATABASE_SSL === 'true'
            ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
            : undefined,
        });

        this.pool.on('error', (err) => {
          console.error('Unexpected error on idle PostgreSQL client', err);
        });
      } catch (e) {
        console.error('Failed to initialize PostgreSQL pool:', e);
        if (this.isMemoryAllowed()) {
          console.warn('Falling back to pg-mem because memory mode is allowed.');
          this.initPgMem();
        } else {
          throw new Error(`Database connection unavailable: Failed to initialize PostgreSQL pool in production.`);
        }
      }
    } else if (this.isMemoryAllowed()) {
      this.initPgMem();
    } else {
      console.error('No DATABASE_URL configured and memory database mode is disabled in production.');
    }
  }

  public async query<T = any>(text: string, params: any[] = []): Promise<DbQueryResult<T>> {
    const ambientClient = this.transactionContext.getStore();
    if (ambientClient) return ambientClient.query<T>(text, params);

    if (this.pool && !this.isUsingMemoryFallback) {
      try {
        const res = await this.pool.query(text, params);
        return { rows: res.rows, rowCount: res.rowCount || 0 };
      } catch (err: any) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.code === 'EHOSTUNREACH' || err.code === 'ECONNRESET') {
          console.error('PostgreSQL connection unavailable:', err.message);
          if (this.isMemoryAllowed()) {
            console.warn('Operating with in-memory database store (memory mode enabled).');
            this.initPgMem();
            if (this.pool) {
              const res = await this.pool.query(text, params);
              return { rows: res.rows, rowCount: res.rowCount || 0 };
            }
            this.isUsingMemoryFallback = true;
          } else {
            throw new Error(`Database connection unavailable: ${err.message}`);
          }
        } else {
          throw err;
        }
      }
    }

    if (!this.pool) {
      if (!this.isMemoryAllowed()) {
        throw new Error('Database connection unavailable: PostgreSQL pool is not initialized and memory mode is disabled.');
      }
      this.initPgMem();
      if (this.pool) {
        const res = await this.pool.query(text, params);
        return { rows: res.rows, rowCount: res.rowCount || 0 };
      }
    }

    return Promise.resolve(this.executeInMemoryQuery<T>(text, params));
  }

  public async transaction<T>(callback: (client: DbQueryClient) => Promise<T>): Promise<T> {
    const ambientClient = this.transactionContext.getStore();
    if (ambientClient) {
      if (this.memDbInstance) {
        const nestedBackup = this.memDbInstance.backup();
        try {
          return await callback(ambientClient);
        } catch (error) {
          nestedBackup.restore();
          throw error;
        }
      }

      const savepoint = `firmbooks_nested_${++this.savepointSequence}`;
      await ambientClient.query(`SAVEPOINT ${savepoint}`);
      try {
        const result = await callback(ambientClient);
        await ambientClient.query(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        await ambientClient.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        throw error;
      }
    }

    if (this.pool && !this.isUsingMemoryFallback) {
      try {
        const client = await this.pool.connect();
        // pg-mem's pg adapter accepts BEGIN/ROLLBACK but does not implement
        // rollback isolation. Its native backup restores the complete database
        // and keeps transaction tests honest.
        const memoryBackup = this.memDbInstance?.backup();
        try {
          await client.query('BEGIN');
          const transactionClient: DbQueryClient = {
            query: async (text, params) => {
              const r = await client.query(text, params);
              return { rows: r.rows, rowCount: r.rowCount || 0 };
            },
          };
          const res = await this.transactionContext.run(transactionClient, () => callback(transactionClient));
          await client.query('COMMIT');
          return res;
        } catch (err) {
          await client.query('ROLLBACK');
          memoryBackup?.restore();
          throw err;
        } finally {
          client.release();
        }
      } catch (err: any) {
        if ((err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.code === 'EHOSTUNREACH' || err.code === 'ECONNRESET') && this.isMemoryAllowed()) {
          console.warn('PostgreSQL unavailable for transaction, switching to pg-mem...');
          this.initPgMem();
        } else {
          throw err;
        }
      }
    }

    if (this.pool) {
      const client = await this.pool.connect();
      const memoryBackup = this.memDbInstance?.backup();
      try {
        await client.query('BEGIN');
        const transactionClient: DbQueryClient = {
          query: async (text, params) => {
            const r = await client.query(text, params);
            return { rows: r.rows, rowCount: r.rowCount || 0 };
          },
        };
        const res = await this.transactionContext.run(transactionClient, () => callback(transactionClient));
        await client.query('COMMIT');
        return res;
      } catch (err) {
        await client.query('ROLLBACK');
        memoryBackup?.restore();
        throw err;
      } finally {
        client.release();
      }
    } else {
      if (!this.isMemoryAllowed()) {
        throw new Error('Database connection unavailable: PostgreSQL is unreachable and memory fallback is prohibited in production mode.');
      }
      const memorySnapshot = new Map(
        Array.from(this.memoryStore.entries(), ([table, rows]) => [table, structuredClone(rows)])
      );
      try {
        const transactionClient: DbQueryClient = {
          query: (text, params) => Promise.resolve(this.executeInMemoryQuery(text, params || [])),
        };
        return await this.transactionContext.run(transactionClient, () => callback(transactionClient));
      } catch (error) {
        this.memoryStore = memorySnapshot;
        throw error;
      }
    }
  }

  private executeInMemoryQuery<T = any>(text: string, params: any[] = []): DbQueryResult<T> {
    const cleanText = text.trim().replace(/\s+/g, ' ');
    const lowerText = cleanText.toLowerCase();

    if (lowerText.startsWith('create table')) {
      const match = cleanText.match(/create table if not exists (\w+)/i) || cleanText.match(/create table (\w+)/i);
      if (match && match[1]) {
        const tableName = match[1].toLowerCase();
        if (!this.memoryStore.has(tableName)) {
          this.memoryStore.set(tableName, []);
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (lowerText.startsWith('select')) {
      const fromMatch = cleanText.match(/from\s+([a-zA-Z0-9_]+)/i);
      if (fromMatch && fromMatch[1]) {
        const tableName = fromMatch[1].toLowerCase();
        let records = [...(this.memoryStore.get(tableName) || [])];

        const orgMatch = cleanText.match(/\borganization_id\s*=\s*\$(\d+)/i);
        if (orgMatch) {
          const pIdx = parseInt(orgMatch[1], 10) - 1;
          const orgVal = params[pIdx];
          if (orgVal !== undefined) {
            records = records.filter((r) => r.organization_id === orgVal || r.organizationId === orgVal);
          }
        }

        const bankAccMatch = cleanText.match(/\bbank_account_id\s*=\s*\$(\d+)/i);
        if (bankAccMatch) {
          const pIdx = parseInt(bankAccMatch[1], 10) - 1;
          const bankAccVal = params[pIdx];
          if (bankAccVal !== undefined) {
            records = records.filter((r) => r.bank_account_id === bankAccVal || r.bankAccountId === bankAccVal);
          }
        }

        const idMatch = cleanText.match(/\bid\s*=\s*\$(\d+)/i);
        if (idMatch) {
          const pIdx = parseInt(idMatch[1], 10) - 1;
          const idVal = params[pIdx];
          if (idVal !== undefined) {
            records = records.filter((r) => r.id === idVal);
          }
        }

        const statusMatch = cleanText.match(/\breconciliation_status\s*=\s*\$(\d+)/i);
        if (statusMatch) {
          const pIdx = parseInt(statusMatch[1], 10) - 1;
          const statusVal = params[pIdx];
          if (statusVal !== undefined) {
            records = records.filter((r) => r.reconciliation_status === statusVal || r.reconciliationStatus === statusVal);
          }
        }

        const fpMatch = cleanText.match(/\bfingerprint\s*=\s*\$(\d+)/i);
        if (fpMatch) {
          const pIdx = parseInt(fpMatch[1], 10) - 1;
          const fpVal = params[pIdx];
          if (fpVal !== undefined) {
            records = records.filter((r) => r.fingerprint === fpVal);
          }
        }

        const hashMatch = cleanText.match(/\bfile_hash\s*=\s*\$(\d+)/i);
        if (hashMatch) {
          const pIdx = parseInt(hashMatch[1], 10) - 1;
          const hashVal = params[pIdx];
          if (hashVal !== undefined) {
            records = records.filter((r) => r.file_hash === hashVal || r.fileHash === hashVal);
          }
        }

        const stmtTxMatch = cleanText.match(/\bstatement_transaction_id\s*=\s*\$(\d+)/i);
        if (stmtTxMatch) {
          const pIdx = parseInt(stmtTxMatch[1], 10) - 1;
          const stmtTxVal = params[pIdx];
          if (stmtTxVal !== undefined) {
            records = records.filter((r) => r.statement_transaction_id === stmtTxVal || r.statementTransactionId === stmtTxVal);
          }
        }

        if (cleanText.includes('email =')) {
          const email = params.find((p) => typeof p === 'string' && p.includes('@'));
          if (email) {
            records = records.filter((r) => r.email?.toLowerCase() === email.toLowerCase());
          }
        }

        return { rows: records as T[], rowCount: records.length };
      }
      return { rows: [], rowCount: 0 };
    }

    if (lowerText.startsWith('insert into')) {
      const match = cleanText.match(/insert into\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*values/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        const cols = match[2].split(',').map((c) => c.trim());
        const record: Record<string, any> = {};

        cols.forEach((col, idx) => {
          const val = params[idx] !== undefined ? params[idx] : null;
          record[col] = val;
          const camelCol = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
          record[camelCol] = val;
        });

        if (!this.memoryStore.has(tableName)) {
          this.memoryStore.set(tableName, []);
        }
        this.memoryStore.get(tableName)!.unshift(record);
        return { rows: [record as T], rowCount: 1 };
      }
    }

    if (lowerText.startsWith('update')) {
      const match = cleanText.match(/update\s+([a-zA-Z0-9_]+)\s+set\s+(.+?)(?:\s+where\s+(.+))?$/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        const setClause = match[2];
        const whereClause = match[3] || '';
        const records = this.memoryStore.get(tableName) || [];

        let targets = [...records];
        const whereIdMatch = whereClause.match(/\bid\s*=\s*\$(\d+)/i);
        if (whereIdMatch) {
          const pIdx = parseInt(whereIdMatch[1], 10) - 1;
          const targetId = params[pIdx];
          targets = targets.filter((r) => r.id === targetId);
        } else {
          const lastParam = params[params.length - 1];
          if (lastParam) {
            const found = records.find((r) => r.id === lastParam);
            if (found) targets = [found];
          }
        }

        for (const target of targets) {
          const assignments = setClause.split(',');
          for (const assign of assignments) {
            const parts = assign.split('=');
            if (parts.length === 2) {
              const col = parts[0].trim().toLowerCase();
              const valExpr = parts[1].trim();

              let val: any = null;
              const paramMatch = valExpr.match(/^\$(\d+)$/);
              if (paramMatch) {
                const pIdx = parseInt(paramMatch[1], 10) - 1;
                val = params[pIdx];
              } else if (valExpr.toUpperCase() === 'NOW()' || valExpr.toUpperCase() === 'CURRENT_TIMESTAMP') {
                val = new Date().toISOString();
              } else if (valExpr.toUpperCase() === 'NULL') {
                val = null;
              } else if (valExpr.toUpperCase() === 'TRUE') {
                val = true;
              } else if (valExpr.toUpperCase() === 'FALSE') {
                val = false;
              } else {
                val = valExpr.replace(/^'|'$/g, '');
              }

              target[col] = val;
              const camelCol = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
              target[camelCol] = val;
            }
          }
        }

        return { rows: targets as T[], rowCount: targets.length };
      }
    }

    if (lowerText.startsWith('delete from')) {
      const match = cleanText.match(/delete from\s+([a-zA-Z0-9_]+)(?:\s+where\s+(.+))?/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        const whereClause = match[2] || '';
        const records = this.memoryStore.get(tableName) || [];
        const whereIdMatch = whereClause.match(/\bid\s*=\s*\$(\d+)/i);
        let idVal = params[0];
        if (whereIdMatch) {
          const pIdx = parseInt(whereIdMatch[1], 10) - 1;
          idVal = params[pIdx];
        }
        const initialLen = records.length;
        const filtered = records.filter((r) => r.id !== idVal);
        this.memoryStore.set(tableName, filtered);
        return { rows: [], rowCount: initialLen - filtered.length };
      }
    }

    return { rows: [], rowCount: 0 };
  }

  public getMemoryStore(): Map<string, any[]> {
    return this.memoryStore;
  }
}

export const db = new DatabaseService();
