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
import { createBrowserId } from '../utils/browserIds';

export class BankingService {
  private static async apiCall<T>(endpoint: string, method: string = 'GET', body?: any): Promise<T> {
    const orgId = localStorage.getItem('active_organization_id');
    const token = import.meta.env.PROD ? null : localStorage.getItem('auth_token');
    const hasSession = localStorage.getItem('firmbooks_authenticated') === 'true';
    if (!orgId || (!token && !hasSession)) throw new Error('Authenticated organization context is required');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Organization-ID': orgId,
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
      headers['Idempotency-Key'] = createBrowserId('mutation');
    }
    const response = await fetch(`/api/v1/banking${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || `Banking request failed (${response.status})`);
    return (json.success ? json.data : json) as T;
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
