import {
  BankingOverviewResponse,
  StatementImportPreviewResponse,
  BankWorkspaceResponse,
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
import { ApiRequestError } from '../api/client';
import { createBrowserId } from '../utils/browserIds';

export class BankingService {
  private static async apiCall<T>(endpoint: string, method: string = 'GET', body?: any, validateSuccessData?: (data: unknown) => string | null): Promise<T> {
    const orgId = typeof window !== 'undefined' ? localStorage.getItem('active_organization_id') : null;
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (orgId) {
      headers['X-Organization-ID'] = orgId;
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
      headers['Idempotency-Key'] = createBrowserId('mutation');
    }
    const origin = typeof window !== 'undefined' && window.location?.origin && window.location.origin.startsWith('http')
      ? window.location.origin
      : 'http://localhost:3001';
    const isGetOrHead = ['GET', 'HEAD'].includes(method.toUpperCase());
    const response = await fetch(`${origin}/api/v1/banking${endpoint}`, {
      method,
      headers,
      body: isGetOrHead || !body ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
    const json = await response.json().catch(() => null);
    const isObject = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
    const errorBody = isObject(json) ? json : {};
    if (!response.ok) {
      throw new ApiRequestError({
        data: null,
        error: typeof errorBody.error === 'string' ? errorBody.error : `Banking request failed (${response.status})`,
        status: response.status,
        errorCode: typeof errorBody.errorCode === 'string' ? errorBody.errorCode : typeof errorBody.code === 'string' ? errorBody.code : undefined,
        requestId: typeof errorBody.requestId === 'string' ? errorBody.requestId : response.headers.get('x-request-id') || undefined,
        recovery: typeof errorBody.recovery === 'string' ? errorBody.recovery : undefined,
        fix: typeof errorBody.fix === 'string' ? errorBody.fix : undefined,
        cause: typeof errorBody.cause === 'string' ? errorBody.cause : undefined,
        retryable: typeof errorBody.retryable === 'boolean' ? errorBody.retryable : undefined,
      }, `Banking request failed (${response.status})`);
    }
    const requestId = isObject(json) && typeof json.requestId === 'string' ? json.requestId : response.headers.get('x-request-id') || undefined;
    const malformedSuccess = (message: string) => new ApiRequestError({
      data: null,
      error: message,
      status: 500,
      errorCode: 'MALFORMED_SUCCESS_RECEIPT',
      requestId,
    }, 'Banking operation outcome could not be confirmed');
    if (isObject(json) && json.success === false) {
      throw malformedSuccess(typeof errorBody.error === 'string' ? errorBody.error : 'Banking returned an unsuccessful response without an HTTP error status.');
    }
    const hasSuccessEnvelope = isObject(json) && json.success === true && Object.prototype.hasOwnProperty.call(json, 'data');
    if (validateSuccessData && !hasSuccessEnvelope) {
      throw malformedSuccess('Banking did not return a valid success receipt.');
    }
    const data = hasSuccessEnvelope ? json.data : json;
    const validationError = validateSuccessData?.(data);
    if (validationError) throw malformedSuccess(validationError);
    return data as T;
  }

  public static getAccounts(): Promise<BankAccount[]> {
    return this.apiCall<BankAccount[]>('/accounts', 'GET');
  }

  public static getGatewayActivity(options: { limit?: number; cursor?: string; gateway?: string; status?: string } = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.gateway) params.set('gateway', options.gateway);
    if (options.status) params.set('status', options.status);
    const query = params.toString();
    return this.apiCall<{
      events: Array<{
        eventId: string; gateway: string; eventType: string; status: string; evidenceStatus: string;
        occurredAt: string; processedAt: string | null; settlementReference: string | null;
        amount: number | null; currency: string | null; paymentId: string | null; paymentNumber: string | null;
        invoiceId: string | null; invoiceNumber: string | null; expenseId: string | null;
        journalEntryId: string | null; journalNumber: string | null; feeJournalId: string | null;
        feeJournalNumber: string | null; reversalJournalNumber: string | null; relatedEventId: string | null; reversalJournalId: string | null;
        payoutBankMatchCount: number | null;
      }>;
      nextCursor: string | null;
      hasMore: boolean;
    }>(`/gateway-activity${query ? `?${query}` : ''}`, 'GET');
  }

  public static createAccount(data: Partial<BankAccount>): Promise<BankAccount> {
    return this.apiCall<BankAccount>('/accounts', 'POST', data, (received) => {
      if (!received || typeof received !== 'object' || Array.isArray(received)) return 'Bank account setup did not return a bank account record.';
      const account = received as Partial<BankAccount>;
      const activeOrganizationId = typeof window !== 'undefined' ? localStorage.getItem('active_organization_id') : null;
      if (typeof account.id !== 'string' || !account.id.trim()) return 'Bank account setup did not return a bank account ID.';
      if (!data.ledgerAccountId || account.ledgerAccountId !== data.ledgerAccountId) return 'Bank account setup did not confirm its link to the saved ledger account.';
      if (!activeOrganizationId || account.organizationId !== activeOrganizationId) return 'Bank account setup did not confirm the active organization.';
      return null;
    });
  }

  public static deleteAccount(bankAccountId: string): Promise<{ deleted: boolean; id: string; ledgerAccountId?: string }> {
    return this.apiCall<{ deleted: boolean; id: string; ledgerAccountId?: string }>(`/accounts/${bankAccountId}`, 'DELETE');
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
    return this.apiCall<BankStatementTransaction[]>(`/transactions${query}`, 'GET');
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

  /** Posts a durable, two-sided bank transfer source document. */
  public static createTransfer(input: {
    fromBankAccountId: string;
    toBankAccountId: string;
    amount: number;
    transferDate: string;
    reference?: string;
    description?: string;
  }): Promise<{ transferId: string; journalEntryId: string }> {
    return this.apiCall('/transfers', 'POST', input);
  }

  public static getTransfers(limit = 50): Promise<Array<{
    id: string; transfer_number: string; transfer_date: string; amount: number; status: string;
    from_bank_account_id: string; to_bank_account_id: string; reference?: string; description?: string;
  }>> {
    return this.apiCall(`/transfers?limit=${encodeURIComponent(String(limit))}`, 'GET');
  }

  public static reverseTransfer(transferId: string, reason: string): Promise<{ transferId: string; reversalJournalEntryId: string }> {
    return this.apiCall(`/transfers/${encodeURIComponent(transferId)}/reverse`, 'POST', { reason });
  }

  /** Creates and matches a posted journal directly from a single unmatched statement line. */
  public static createTransactionFromStatement(
    statementTransactionId: string,
    targetAccountId: string,
    description?: string
  ): Promise<{ journalEntryId: string; match: BankReconciliationMatch }> {
    return this.apiCall(`/transactions/${encodeURIComponent(statementTransactionId)}/create-accounting-transaction`, 'POST', { targetAccountId, description });
  }

  /** Reverses the created journal and restores the statement line to UNMATCHED. */
  public static reverseTransactionCreatedFromStatement(
    statementTransactionId: string,
    reason: string
  ): Promise<{ statementTransactionId: string; reversalJournalEntryId: string }> {
    return this.apiCall(`/transactions/${encodeURIComponent(statementTransactionId)}/reverse-created-transaction`, 'POST', { reason });
  }

  // --- STATEMENT-FIRST ZOHO-STYLE BANKING WORKFLOWS ---

  public static getOverview(): Promise<BankingOverviewResponse> {
    return this.apiCall<BankingOverviewResponse>('/accounts/overview', 'GET');
  }

  public static previewImport(payload: {
    fileContent: string;
    filename: string;
    bankAccountId?: string;
    mapping?: CSVColumnMapping;
  }): Promise<StatementImportPreviewResponse> {
    return this.apiCall<StatementImportPreviewResponse>('/imports/preview', 'POST', payload);
  }

  public static confirmImport(payload: {
    fileContent: string;
    filename: string;
    mode: 'USE_EXISTING' | 'CREATE_NEW';
    bankAccountId?: string;
    newBankData?: {
      bankName: string;
      accountName: string;
      accountNumber: string;
      currency?: string;
      ledgerAccountId?: string;
    };
    mapping?: CSVColumnMapping;
  }): Promise<{
    success: boolean;
    bankAccountId: string;
    importId: string;
    newTransactionsCount: number;
    exactDuplicatesCount: number;
    possibleDuplicatesCount: number;
    discrepancy: number;
  }> {
    return this.apiCall('/imports/confirm', 'POST', payload);
  }

  public static getWorkspace(
    bankAccountId: string,
    options: { tab?: string; search?: string; limit?: number; offset?: number } = {}
  ): Promise<BankWorkspaceResponse> {
    const params = new URLSearchParams();
    params.append('bankAccountId', bankAccountId);
    if (options.tab) params.append('tab', options.tab);
    if (options.search) params.append('search', options.search);
    if (options.limit) params.append('limit', String(options.limit));
    if (options.offset) params.append('offset', String(options.offset));
    return this.apiCall<BankWorkspaceResponse>(`/workspace?${params.toString()}`, 'GET');
  }

  public static getTransactionSuggestions(transactionId: string, candidates?: any[]): Promise<MatchSuggestion[]> {
    return this.apiCall<MatchSuggestion[]>(`/transactions/${transactionId}/suggestions`, 'GET');
  }

  public static categorizeTransaction(
    transactionId: string,
    payload: {
      ledgerAccountId: string;
      counterpartyId?: string;
      counterpartyName?: string;
      projectId?: string;
      gstTreatment?: string;
      tdsAmount?: number;
      notes?: string;
      reference?: string;
      createRule?: boolean;
      ruleName?: string;
    }
  ): Promise<{ success: boolean; journalEntryId: string; transaction: BankStatementTransaction }> {
    return this.apiCall(`/transactions/${transactionId}/categorize`, 'POST', payload);
  }

  public static ignoreTransaction(transactionId: string, isIgnored: boolean): Promise<{ isIgnored: boolean }> {
    return this.apiCall(`/transactions/${transactionId}/ignore`, 'POST', { isIgnored });
  }

  public static reopenReconciliation(bankAccountId: string): Promise<{ reopened: boolean }> {
    return this.apiCall('/reconciliation/reopen', 'POST', { bankAccountId });
  }

}
