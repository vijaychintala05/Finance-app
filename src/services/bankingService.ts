import { BankReconciliationService } from '../../server/src/banking/BankReconciliationService';
import {
  AccountingTransactionType,
  BankAccount,
  BankReconciliationMatch,
  BankReconciliationRule,
  BankReconciliationSession,
  BankStatementImport,
  BankStatementSourceFormat,
  BankStatementTransaction,
  CSVColumnMapping,
  MatchSuggestion,
} from '../types/banking';

export class BankingService {
  private static async apiCall<T>(endpoint: string, method: string = 'GET', body?: any): Promise<T> {
    const orgId = localStorage.getItem('activeOrgId') || 'ORG-PRIMARY';
    const token = localStorage.getItem('authToken') || 'mock-jwt-token';

    try {
      const response = await fetch(`/api/v1/banking${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Organization-ID': orgId,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        const json = await response.json();
        if (json.success) return json.data;
      }
    } catch (e) {
      // API call failed, fallback to local BankReconciliationService
    }

    // Client-side fallback using direct BankReconciliationService
    if (endpoint === '/accounts' && method === 'GET') {
      return (await BankReconciliationService.getBankAccounts(orgId)) as any;
    }
    if (endpoint === '/accounts' && method === 'POST') {
      return (await BankReconciliationService.createBankAccount(orgId, body)) as any;
    }
    if (endpoint === '/imports' && method === 'POST') {
      return (await BankReconciliationService.importStatement(
        orgId,
        body.bankAccountId,
        body.filename,
        body.content,
        body.sourceFormat,
        body.mapping
      )) as any;
    }
    if (endpoint === '/imports' && method === 'GET') {
      return (await BankReconciliationService.getStatementImports(orgId)) as any;
    }
    if (endpoint.startsWith('/transactions') && method === 'GET') {
      return (await BankReconciliationService.getTransactions(orgId, body || {})) as any;
    }
    if (endpoint === '/matches/suggestions' && method === 'POST') {
      return (await BankReconciliationService.getMatchingSuggestions(orgId, body.transactionId, body.candidates || [])) as any;
    }
    if (endpoint === '/matches' && method === 'POST') {
      return (await BankReconciliationService.matchTransaction(
        orgId,
        body.statementTransactionId,
        body.accountingTransactionType,
        body.accountingTransactionId,
        body.matchedAmount
      )) as any;
    }
    if (endpoint.startsWith('/matches/') && method === 'DELETE') {
      const matchId = endpoint.replace('/matches/', '');
      return (await BankReconciliationService.unmatchTransaction(orgId, matchId)) as any;
    }
    if (endpoint === '/rules' && method === 'GET') {
      return (await BankReconciliationService.getRules(orgId)) as any;
    }
    if (endpoint === '/rules' && method === 'POST') {
      return (await BankReconciliationService.createRule(orgId, body)) as any;
    }
    if (endpoint.startsWith('/rules/') && method === 'DELETE') {
      const ruleId = endpoint.replace('/rules/', '');
      return (await BankReconciliationService.deleteRule(orgId, ruleId)) as any;
    }
    if (endpoint.startsWith('/reconciliation/summary') && method === 'GET') {
      return (await BankReconciliationService.getReconciliationSummary(
        orgId,
        body?.bankAccountId || 'bank-1',
        body?.statementEndDate || new Date().toISOString().substring(0, 10),
        body?.statementClosingBalance || 0,
        body?.glBankBalance || 0
      )) as any;
    }
    if (endpoint === '/reconciliation/complete' && method === 'POST') {
      return (await BankReconciliationService.completeReconciliationSession(
        orgId,
        body.bankAccountId,
        body.statementEndDate,
        body.statementClosingBalance,
        body.glBankBalance
      )) as any;
    }

    throw new Error(`Failed execution for ${method} ${endpoint}`);
  }

  public static getAccounts(): Promise<BankAccount[]> {
    return this.apiCall<BankAccount[]>('/accounts', 'GET');
  }

  public static createAccount(data: Partial<BankAccount>): Promise<BankAccount> {
    return this.apiCall<BankAccount>('/accounts', 'POST', data);
  }

  public static importStatement(
    bankAccountId: string,
    filename: string,
    content: string,
    sourceFormat?: BankStatementSourceFormat,
    mapping?: CSVColumnMapping
  ): Promise<{ import: BankStatementImport; newTransactionsCount: number; duplicateCount: number; discrepancy: number }> {
    return this.apiCall('/imports', 'POST', { bankAccountId, filename, content, sourceFormat, mapping });
  }

  public static getImports(bankAccountId?: string): Promise<BankStatementImport[]> {
    const query = bankAccountId ? `?bankAccountId=${bankAccountId}` : '';
    return this.apiCall<BankStatementImport[]>(`/imports${query}`, 'GET');
  }

  public static getTransactions(options: {
    bankAccountId?: string;
    status?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<BankStatementTransaction[]> {
    const params = new URLSearchParams();
    if (options.bankAccountId) params.append('bankAccountId', options.bankAccountId);
    if (options.status) params.append('status', options.status);
    if (options.search) params.append('search', options.search);
    if (options.fromDate) params.append('fromDate', options.fromDate);
    if (options.toDate) params.append('toDate', options.toDate);
    if (options.limit) params.append('limit', String(options.limit));
    if (options.offset) params.append('offset', String(options.offset));

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.apiCall<BankStatementTransaction[]>(`/transactions${query}`, 'GET', options);
  }

  public static getSuggestions(transactionId: string, candidates: any[]): Promise<MatchSuggestion[]> {
    return this.apiCall<MatchSuggestion[]>('/matches/suggestions', 'POST', { transactionId, candidates });
  }

  public static matchTransaction(
    statementTransactionId: string,
    accountingTransactionType: AccountingTransactionType,
    accountingTransactionId: string,
    matchedAmount: number
  ): Promise<BankReconciliationMatch> {
    return this.apiCall<BankReconciliationMatch>('/matches', 'POST', {
      statementTransactionId,
      accountingTransactionType,
      accountingTransactionId,
      matchedAmount,
    });
  }

  public static unmatchTransaction(matchId: string): Promise<boolean> {
    return this.apiCall<boolean>(`/matches/${matchId}`, 'DELETE');
  }

  public static getRules(): Promise<BankReconciliationRule[]> {
    return this.apiCall<BankReconciliationRule[]>('/rules', 'GET');
  }

  public static createRule(data: Partial<BankReconciliationRule>): Promise<BankReconciliationRule> {
    return this.apiCall<BankReconciliationRule>('/rules', 'POST', data);
  }

  public static deleteRule(ruleId: string): Promise<boolean> {
    return this.apiCall<boolean>(`/rules/${ruleId}`, 'DELETE');
  }

  public static getReconciliationSummary(
    bankAccountId: string,
    statementEndDate: string,
    statementClosingBalance: number,
    glBankBalance: number
  ): Promise<{
    statementClosingBalance: number;
    glBankBalance: number;
    matchedDepositsTotal: number;
    matchedWithdrawalsTotal: number;
    unmatchedDepositsTotal: number;
    unmatchedWithdrawalsTotal: number;
    difference: number;
    status: 'BALANCED' | 'DISCREPANCY';
  }> {
    const params = new URLSearchParams({
      bankAccountId,
      statementEndDate,
      statementClosingBalance: String(statementClosingBalance),
      glBankBalance: String(glBankBalance),
    });
    return this.apiCall(`/reconciliation/summary?${params.toString()}`, 'GET', {
      bankAccountId,
      statementEndDate,
      statementClosingBalance,
      glBankBalance,
    });
  }

  public static completeReconciliationSession(
    bankAccountId: string,
    statementEndDate: string,
    statementClosingBalance: number,
    glBankBalance: number
  ): Promise<BankReconciliationSession> {
    return this.apiCall<BankReconciliationSession>('/reconciliation/complete', 'POST', {
      bankAccountId,
      statementEndDate,
      statementClosingBalance,
      glBankBalance,
    });
  }
}
