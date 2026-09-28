import {
  BankingOverviewResponse,
  StatementImportPreviewResponse,
  BankWorkspaceResponse,
  AccountingTransactionType,
  BankAccount,
  BankBookMovementPage,
  BankBookMovementSuggestion,
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
  private static readonly pendingBankMutationKeys = new Map<string, string>();

  private static async stableMutationKey(action: string, operationPayload: unknown): Promise<{ key: string; clear: () => void }> {
    const serialized = JSON.stringify(operationPayload);
    let digest: string;
    if (globalThis.crypto?.subtle) {
      const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized)));
      digest = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    } else {
      let hash = 2166136261;
      for (let index = 0; index < serialized.length; index += 1) { hash ^= serialized.charCodeAt(index); hash = Math.imul(hash, 16777619); }
      digest = (hash >>> 0).toString(16);
    }
    const storageKey = `firmbooks:banking:${action}:${digest}`;
    const clear = () => {
      this.pendingBankMutationKeys.delete(storageKey);
      try { if (typeof window !== 'undefined') window.sessionStorage.removeItem(storageKey); } catch { /* In-memory key is still cleared. */ }
    };
    try {
      const storage = typeof window !== 'undefined' ? window.sessionStorage : null;
      const key = this.pendingBankMutationKeys.get(storageKey) || storage?.getItem(storageKey) || createBrowserId('banking');
      this.pendingBankMutationKeys.set(storageKey, key);
      storage?.setItem(storageKey, key);
      return { key, clear };
    } catch {
      const key = this.pendingBankMutationKeys.get(storageKey) || createBrowserId('banking');
      this.pendingBankMutationKeys.set(storageKey, key);
      return { key, clear };
    }
  }

  private static async stableWrite<T>(action: string, operationPayload: unknown, suppliedKey: string | undefined, request: (key: string) => Promise<T>): Promise<T> {
    const operation = await this.stableMutationKey(action, operationPayload);
    try {
      const result = await request(suppliedKey || operation.key);
      operation.clear();
      return result;
    } catch (error) {
      if (error instanceof ApiRequestError && error.response.status < 500 && !error.message.toLowerCase().includes('already being processed')) operation.clear();
      throw error;
    }
  }

  private static async apiCall<T>(endpoint: string, method: string = 'GET', body?: any, validateSuccessData?: (data: unknown) => string | null, idempotencyKey?: string): Promise<T> {
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
      headers['Idempotency-Key'] = idempotencyKey || createBrowserId('mutation');
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

  public static getBookMovements(
    bankAccountId: string,
    options: { search?: string; limit?: number; offset?: number } = {}
  ): Promise<BankBookMovementPage> {
    const params = new URLSearchParams();
    if (options.search) params.set('search', options.search);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    return this.apiCall<BankBookMovementPage>(
      `/accounts/${encodeURIComponent(bankAccountId)}/book-movements?${params.toString()}`,
      'GET'
    );
  }

  public static getBookMovementSuggestions(statementTransactionId: string): Promise<BankBookMovementSuggestion[]> {
    return this.apiCall<BankBookMovementSuggestion[]>(
      `/transactions/${encodeURIComponent(statementTransactionId)}/book-suggestions`,
      'GET'
    );
  }

  /** Confirms a user-selected posted bank-ledger movement against statement evidence. */
  public static allocateBookMovement(input: {
    statementTransactionId: string;
    journalLineId: string;
    amount: string | number;
  }, idempotencyKey?: string): Promise<{
    allocationId: string;
    statementTransactionId: string;
    journalLineId: string;
    journalEntryId: string;
    amount: string;
    statementStatus: string;
  }> {
    return this.stableWrite('allocate', input, idempotencyKey, (key) => this.apiCall<{
      allocationId: string; statementTransactionId: string; journalLineId: string; journalEntryId: string; amount: string; statementStatus: string;
    }>('/reconciliation/allocations', 'POST', input, (data) => {
      const row = data as Record<string, unknown>;
      return row && typeof row.allocationId === 'string' && typeof row.statementTransactionId === 'string' &&
        typeof row.journalLineId === 'string' && typeof row.journalEntryId === 'string' && typeof row.amount === 'string' &&
        typeof row.statementStatus === 'string' ? null : 'Bank allocation receipt is incomplete.';
    }, key));
  }

  /** Posts a simple income/expense entry and links it to the statement in one transaction. */
  public static createMissingEntryFromStatement(input: {
    statementTransactionId: string;
    counterAccountId: string;
    expectedRemainderAmount: string;
    creationOperationId: string;
    description?: string;
  }, idempotencyKey?: string): Promise<{
    journalEntryId: string;
    journalLineId: string;
    allocationId: string;
    creationOperationId: string;
    amount: string;
    statementStatus: string;
  }> {
    return this.stableWrite('create-entry', input, idempotencyKey, (key) => this.apiCall<{
    journalEntryId: string;
    journalLineId: string;
    allocationId: string;
    creationOperationId: string;
    amount: string;
    statementStatus: string;
  }>(
      `/transactions/${encodeURIComponent(input.statementTransactionId)}/create-missing-entry`,
      'POST',
      { counterAccountId: input.counterAccountId, expectedRemainderAmount: input.expectedRemainderAmount, creationOperationId: input.creationOperationId, description: input.description },
      (data) => {
        const row = data as Record<string, unknown>;
        return row && typeof row.journalEntryId === 'string' && typeof row.journalLineId === 'string' &&
          typeof row.allocationId === 'string' && row.creationOperationId === input.creationOperationId &&
          typeof row.amount === 'string' && typeof row.statementStatus === 'string'
          ? null : 'Created-entry receipt is incomplete.';
      },
      key
    ));
  }

  public static unmatchBookMovement(allocationId: string, reason: string): Promise<{ allocationId: string; statementStatus: string }> {
    const input = { allocationId, reason };
    return this.stableWrite('unmatch-allocation', input, undefined, (key) =>
      this.apiCall(`/reconciliation/allocations/${encodeURIComponent(allocationId)}`, 'DELETE', { reason }, undefined, key));
  }

  public static reverseCreatedTransactionFromStatement(statementTransactionId: string, allocationId: string, reason: string): Promise<{
    statementTransactionId: string; reversalJournalEntryId: string;
  }> {
    const input = { statementTransactionId, allocationId, reason };
    return this.stableWrite('reverse-statement-entry', input, undefined, (key) =>
      this.apiCall(`/transactions/${encodeURIComponent(statementTransactionId)}/reverse-created-transaction`, 'POST', { allocationId, reason }, undefined, key));
  }

  public static getPossibleDuplicateCandidates(statementTransactionId: string): Promise<Array<{
    id: string; transactionDate: string; amount: string; direction: string; narration: string;
    reference: string | null; reconciliationStatus: string; currency?: string; fingerprint?: string; importId?: string;
  }>> {
    return this.apiCall(`/transactions/${encodeURIComponent(statementTransactionId)}/possible-duplicates`, 'GET');
  }

  public static confirmStatementDuplicate(input: { statementTransactionId: string; targetStatementTransactionId: string; reason: string }, idempotencyKey?: string) {
    return this.stableWrite('confirm-statement-duplicate', input, idempotencyKey, (key) => this.apiCall<{
      dispositionId: string; statementTransactionId: string; targetStatementTransactionId: string; status: 'CONFIRMED_DUPLICATE';
    }>(`/transactions/${encodeURIComponent(input.statementTransactionId)}/confirm-duplicate`, 'POST', {
      targetStatementTransactionId: input.targetStatementTransactionId, reason: input.reason,
    }, (data) => {
      const row = data as Record<string, unknown>;
      return row && typeof row.dispositionId === 'string' && row.statementTransactionId === input.statementTransactionId &&
        row.targetStatementTransactionId === input.targetStatementTransactionId && row.status === 'CONFIRMED_DUPLICATE'
        ? null : 'Duplicate confirmation receipt is incomplete.';
    }, key));
  }

  public static revokeStatementDuplicate(input: { statementTransactionId: string; reason: string }) {
    return this.stableWrite('revoke-statement-duplicate', input, undefined, (key) => this.apiCall<{
      dispositionId: string; statementTransactionId: string; status: 'POSSIBLE_DUPLICATE';
    }>(`/transactions/${encodeURIComponent(input.statementTransactionId)}/revoke-duplicate`, 'POST', { reason: input.reason }, (data) => {
      const row = data as Record<string, unknown>;
      return row && typeof row.dispositionId === 'string' && row.statementTransactionId === input.statementTransactionId && row.status === 'POSSIBLE_DUPLICATE'
        ? null : 'Duplicate revocation receipt is incomplete.';
    }, key));
  }

  public static getCanonicalStatementReceipt(statementTransactionId: string): Promise<{
    statementTransactionId: string;
    statementStatus: string;
    reviewDecision: string | null;
    legacyMatches: Array<{ matchId: string; sourceType: string; sourceId: string; amount: string; status: string }>;
    allocations: Array<{
      allocationId: string; journalLineId: string | null; journalEntryId: string | null; entryNumber: string | null;
      reversalJournalEntryId: string | null; reversalEntryNumber: string | null;
      amount: string; allocationState: string; identityState: string; creationOrigin: string; creationOperationId: string | null;
    }>;
  }> {
    return this.apiCall(`/transactions/${encodeURIComponent(statementTransactionId)}/canonical-receipt`, 'GET');
  }

  public static getLegacyAllocationCandidate(statementTransactionId: string, matchId: string): Promise<{
    matchId: string; statementTransactionId: string; journalEntryId: string; journalLineId: string; entryNumber: string;
    journalDate: string; matchedAmount: string; lineCapacity: string; sourceType: string; sourceId: string;
  }> {
    return this.apiCall(`/transactions/${encodeURIComponent(statementTransactionId)}/legacy-matches/${encodeURIComponent(matchId)}/candidate`, 'GET');
  }

  public static verifyLegacyAllocation(statementTransactionId: string, matchId: string, expectedJournalLineId: string, reason: string): Promise<unknown> {
    const input = { expectedJournalLineId, reason };
    return this.stableWrite(`verify-legacy-allocation:${statementTransactionId}:${matchId}`, input, undefined, (key) =>
      this.apiCall(`/transactions/${encodeURIComponent(statementTransactionId)}/legacy-matches/${encodeURIComponent(matchId)}/verify`, 'POST', input, undefined, key));
  }

  public static reviewStatementTransaction(input: {
    statementTransactionId: string;
    decision: 'ACCEPT' | 'KEEP_AS_NEW';
    acknowledgedCandidateIds?: string[];
  }, idempotencyKey?: string): Promise<{
    statementTransactionId: string; decision: 'ACCEPT' | 'KEEP_AS_NEW'; status: 'UNMATCHED'; candidateIds: string[];
  }> {
    return this.stableWrite('review-statement', input, idempotencyKey, (key) => this.apiCall<{
    statementTransactionId: string; decision: 'ACCEPT' | 'KEEP_AS_NEW'; status: 'UNMATCHED'; candidateIds: string[];
  }>(
      `/transactions/${encodeURIComponent(input.statementTransactionId)}/review`, 'POST',
      { decision: input.decision, acknowledgedCandidateIds: input.acknowledgedCandidateIds || [] },
      (data) => {
        const row = data as Record<string, unknown>;
        return row && row.statementTransactionId === input.statementTransactionId && row.decision === input.decision &&
          row.status === 'UNMATCHED' && Array.isArray(row.candidateIds)
          ? null : 'Statement review receipt is incomplete.';
      }, key
    ));
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
  ): Promise<{ import: BankStatementImport; newTransactionsCount: number; duplicateCount: number; discrepancy: number | null }> {
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
    const payload = {
      bankAccountId,
      statementEndDate,
      statementClosingBalance,
      glBankBalance,
    };
    return this.stableWrite('complete-reconciliation', payload, undefined, (key) =>
      this.apiCall<BankReconciliationSession>('/reconciliation/complete', 'POST', payload, undefined, key));
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
    reason: string,
    allocationId?: string,
  ): Promise<{ statementTransactionId: string; reversalJournalEntryId: string }> {
    return this.apiCall(`/transactions/${encodeURIComponent(statementTransactionId)}/reverse-created-transaction`, 'POST', { allocationId, reason });
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
    discrepancy: number | null;
  }> {
    return this.stableWrite('confirm-import', payload, undefined, (key) =>
      this.apiCall('/imports/confirm', 'POST', payload, undefined, key));
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
    const payload = { bankAccountId };
    return this.stableWrite('reopen-reconciliation', payload, undefined, (key) =>
      this.apiCall('/reconciliation/reopen', 'POST', payload, undefined, key));
  }

}
