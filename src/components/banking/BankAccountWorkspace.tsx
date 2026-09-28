import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileCheck2,
  FileSpreadsheet,
  History,
  Landmark,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Account, JournalEntry } from '../../types';
import { BankAccount, BankBookMovement, BankBookMovementPage, BankBookMovementSuggestion, BankStatementTransaction, BankWorkspaceResponse } from '../../types/banking';
import { BankingService } from '../../services/bankingService';
import { apiClient, ApiRequestError } from '../../api/client';
import { useFinanceCapabilities } from '../../capabilities/useFinanceCapabilities';
import { formatCurrency, formatDate } from '../../utils/formatters';

function moneyToCents(value: unknown): bigint {
  const text = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(text)) throw new Error('Statement amount is invalid.');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
}

function centsToMoney(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

function newCreationOperationId(): string {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `bankentry-${id}`;
}

function getRemainingStatementCents(
  statementAmount: unknown,
  receipt: Awaited<ReturnType<typeof BankingService.getCanonicalStatementReceipt>>,
): bigint {
  const unresolvedLegacy = receipt.legacyMatches.some((match) =>
    !['REJECTED', 'REVERSED', 'UNMATCHED'].includes(String(match.status || '').toUpperCase()));
  if (unresolvedLegacy) throw new Error('BANK_LEGACY_ALLOCATION_UNRESOLVED');
  const statementCents = moneyToCents(statementAmount);
  let allocatedCents = 0n;
  for (const allocation of receipt.allocations) {
    if (allocation.allocationState !== 'ACTIVE') continue;
    if (allocation.identityState !== 'VERIFIED') throw new Error('BANK_STATEMENT_ALLOCATION_UNVERIFIED');
    allocatedCents += moneyToCents(allocation.amount);
  }
  const remaining = statementCents - allocatedCents;
  if (remaining <= 0n) throw new Error('BANK_STATEMENT_ALREADY_PROCESSED');
  return remaining;
}

function bankingActionError(error: unknown, fallback: string): string {
  const code = error instanceof ApiRequestError ? error.response.errorCode : undefined;
  const messages: Record<string, string> = {
    BANK_STATEMENT_REVIEW_REQUIRED: 'Review and confirm this imported line before matching or adding it.',
    BANK_STATEMENT_DUPLICATE_ACK_REQUIRED: 'Review every possible duplicate listed, then confirm this line is distinct.',
    BANK_STATEMENT_DUPLICATE_CANDIDATES_TOO_MANY: 'Too many similar lines were found to safely decide automatically. Narrow the import and review it with your accountant.',
    BANK_STATEMENT_REVIEW_STATE_INVALID: 'This line changed after you opened it. Refresh Banking and review its current state.',
    BANK_STATEMENT_ALREADY_ALLOCATED: 'This line already has an allocation. Refresh the workspace to see its current match.',
    BANK_BOOK_CAPACITY_EXCEEDED: 'Another action used part of this ledger movement. Refresh suggestions and try again.',
    BANK_STATEMENT_CAPACITY_EXCEEDED: 'Another action used part of this statement line. Refresh the workspace and review the remaining amount.',
    BANK_STATEMENT_REMAINDER_CHANGED: 'The remaining amount changed before posting. Review the updated amount and confirm again.',
    BANK_RECONCILIATION_COMPLETED: 'This statement period is closed. Reopen the latest reconciliation before changing it.',
    BANK_CURRENCY_UNSUPPORTED: 'The statement, bank account, and ledger currencies do not agree. Check the account setup before matching.',
    BANK_LEGACY_ALLOCATION_UNRESOLVED: 'This account has older matches that need review before new allocations can be made.',
    BANK_LEDGER_PROFILE_AMBIGUOUS: 'More than one bank profile points to this ledger account. Ask an administrator to resolve the account link.',
    BANK_COUNTER_ACCOUNT_NOT_ALLOWED: 'Choose an active income or expense account that allows direct posting.',
    BANK_STATEMENT_IGNORED: 'This statement line is ignored. Restore it for review before reconciling.',
  };
  if (code && messages[code]) return messages[code];
  return error instanceof Error ? error.message : fallback;
}

interface BankAccountWorkspaceProps {
  account: Account;
  bankAccount: BankAccount | null;
  journalEntries: JournalEntry[];
  currencySymbol: string;
  onBackToOverview: () => void;
  onImportStatement: () => void;
  onReconcile: () => void;
  onTransferFunds: () => void;
  onRecordTransaction: () => void;
  onOpenMatch: (tx: any) => void;
  onOpenCategorize: (tx: any) => void;
  onSelectTxDetails: (tx: any) => void;
  onRefresh: () => void;
  refreshTrigger?: number;
}

export const BankAccountWorkspace: React.FC<BankAccountWorkspaceProps> = ({
  account,
  bankAccount,
  journalEntries,
  currencySymbol,
  onBackToOverview,
  onImportStatement,
  onReconcile,
  onTransferFunds,
  onRecordTransaction,
  onOpenMatch,
  onOpenCategorize,
  onSelectTxDetails,
  onRefresh,
  refreshTrigger,
}) => {
  const [statementRows, setStatementRows] = useState<BankStatementTransaction[]>([]);
  const [statementOffset, setStatementOffset] = useState(0);
  const [workspaceTotalRows, setWorkspaceTotalRows] = useState(0);
  const [workspaceFilteredRows, setWorkspaceFilteredRows] = useState(0);
  const [serverStatusCounts, setServerStatusCounts] = useState<BankWorkspaceResponse['statusCounts'] | null>(null);
  const [bookMovementPage, setBookMovementPage] = useState<BankBookMovementPage | null>(null);
  const [bookMovementOffset, setBookMovementOffset] = useState(0);
  const [isBookLoading, setIsBookLoading] = useState(false);
  const [bookMovementError, setBookMovementError] = useState<string | null>(null);
  const [activeSourceView, setActiveSourceView] = useState<'STATEMENT' | 'BOOKS'>('STATEMENT');
  const workspaceRequestId = useRef(0);
  const bookRequestId = useRef(0);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'ALL' | 'TO_REVIEW' | 'POSSIBLE_DUPLICATES' | 'MATCHED' | 'CATEGORIZED' | 'RECONCILED'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [resolvingTransactionId, setResolvingTransactionId] = useState<string | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [resolutionNotice, setResolutionNotice] = useState<string | null>(null);
  const [bookSuggestions, setBookSuggestions] = useState<BankBookMovementSuggestion[] | null>(null);
  const [suggestionStatementId, setSuggestionStatementId] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<{ code?: string; message: string } | null>(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [allocatingMovementId, setAllocatingMovementId] = useState<string | null>(null);
  const suggestionRequestId = useRef(0);
  const financeCapabilities = useFinanceCapabilities();
  const canonicalBankWritesEnabled = financeCapabilities.isEnabled('bank-movement-allocations');
  const statementEntryCreationEnabled = financeCapabilities.isEnabled('bank-statement-entry-creation');
  const [reviewStatementId, setReviewStatementId] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'ACCEPT' | 'KEEP_AS_NEW' | 'CONFIRM_DUPLICATE'>('ACCEPT');
  const [duplicateCandidates, setDuplicateCandidates] = useState<Array<{ id: string; transactionDate: string; amount: string; direction: string; narration: string; reference: string | null; reconciliationStatus: string }> | null>(null);
  const [duplicateTargetId, setDuplicateTargetId] = useState('');
  const [duplicateReason, setDuplicateReason] = useState('');
  const [revokeDuplicateId, setRevokeDuplicateId] = useState<string | null>(null);
  const [revokeDuplicateReason, setRevokeDuplicateReason] = useState('');
  const [isLoadingDuplicates, setIsLoadingDuplicates] = useState(false);
  const [acknowledgeDuplicates, setAcknowledgeDuplicates] = useState(false);
  const [isReviewingStatement, setIsReviewingStatement] = useState(false);
  const [createEntryStatementId, setCreateEntryStatementId] = useState<string | null>(null);
  const [createEntryOperationId, setCreateEntryOperationId] = useState<string | null>(null);
  const [createEntryExpectedRemainder, setCreateEntryExpectedRemainder] = useState<string | null>(null);
  const [counterAccounts, setCounterAccounts] = useState<Account[]>([]);
  const [selectedCounterAccountId, setSelectedCounterAccountId] = useState('');
  const [entryDescription, setEntryDescription] = useState('');
  const [isLoadingCounterAccounts, setIsLoadingCounterAccounts] = useState(false);
  const [isLoadingEntryReceipt, setIsLoadingEntryReceipt] = useState(false);
  const [isCreatingEntry, setIsCreatingEntry] = useState(false);
  const [receiptStatementId, setReceiptStatementId] = useState<string | null>(null);
  const [canonicalReceipt, setCanonicalReceipt] = useState<Awaited<ReturnType<typeof BankingService.getCanonicalStatementReceipt>> | null>(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [allocationReasons, setAllocationReasons] = useState<Record<string, string>>({});
  const [legacyCandidates, setLegacyCandidates] = useState<Record<string, Awaited<ReturnType<typeof BankingService.getLegacyAllocationCandidate>>>>({});
  const [legacyReasons, setLegacyReasons] = useState<Record<string, string>>({});
  const [mutatingAllocationId, setMutatingAllocationId] = useState<string | null>(null);

  const [workspaceBalances, setWorkspaceBalances] = useState<{
    bookBalance: number | null;
    statementBalance: number | null;
    difference: number | null;
  } | null>(null);

  // Fetch statement rows and live balances for this bank account
  const loadWorkspaceTransactions = React.useCallback(async () => {
    const requestId = ++workspaceRequestId.current;
    let targetBnk = bankAccount;
    if (!targetBnk && account && typeof BankingService.getAccounts === 'function') {
      try {
        const list = await BankingService.getAccounts();
        if (requestId !== workspaceRequestId.current) return;
        targetBnk = list.find((b) => b.ledgerAccountId === account.id || b.id === account.id) || null;
      } catch (e) {
        // Fallback silently
      }
    }
    if (!targetBnk) return;
    setIsLoading(true);
    try {
      if (typeof BankingService.getWorkspace === 'function') {
        try {
          const ws = await BankingService.getWorkspace(targetBnk.id, {
            tab: activeTab,
            search: searchQuery.trim() || undefined,
            limit: 100,
            offset: statementOffset,
          });
          if (requestId !== workspaceRequestId.current) return;
          if (ws?.transactions) {
            setStatementRows(ws.transactions);
            setWorkspaceTotalRows(Number(ws.totalTransactions || 0));
            setWorkspaceFilteredRows(Number(ws.filteredTransactionsCount ?? ws.totalTransactions ?? 0));
            setServerStatusCounts(ws.statusCounts || null);
            if (ws.balances) {
              setWorkspaceBalances(ws.balances);
            }
            return;
          }
        } catch (wsErr) {
          console.warn('Workspace endpoint failed, falling back to getTransactions:', wsErr);
        }
      }

      if (typeof BankingService.getTransactions === 'function') {
        const rows = await BankingService.getTransactions({
          bankAccountId: targetBnk.id,
          limit: 100,
        });
        if (requestId !== workspaceRequestId.current) return;
        setStatementRows(rows || []);
      }
    } catch (err) {
      if (requestId === workspaceRequestId.current) console.warn('Could not load bank statement transactions:', err);
    } finally {
      if (requestId === workspaceRequestId.current) setIsLoading(false);
    }
  }, [bankAccount, account, activeTab, searchQuery, statementOffset]);

  useEffect(() => {
    workspaceRequestId.current += 1;
    bookRequestId.current += 1;
    suggestionRequestId.current += 1;
    setStatementRows([]);
    setWorkspaceBalances(null);
    setBookMovementPage(null);
    setBookMovementError(null);
    setBookSuggestions(null);
    setSuggestionStatementId(null);
    setSuggestionError(null);
    setIsLoadingSuggestions(false);
    setBookMovementOffset(0);
    setSearchQuery('');
    setActiveSourceView('STATEMENT');
  }, [bankAccount?.id, account.id]);

  useEffect(() => {
    void loadWorkspaceTransactions();
  }, [loadWorkspaceTransactions, refreshTrigger]);

  useEffect(() => {
    if (activeSourceView !== 'BOOKS' || !bankAccount?.id || !bankAccount.ledgerAccountId) {
      setBookMovementPage(null);
      setIsBookLoading(false);
      return;
    }
    const requestId = ++bookRequestId.current;
    const accountId = bankAccount.id;
    setBookMovementPage(null);
    setBookMovementError(null);
    setIsBookLoading(true);
    const timer = window.setTimeout(() => {
      void BankingService.getBookMovements(accountId, {
        search: searchQuery.trim() || undefined,
        limit: 25,
        offset: bookMovementOffset,
      }).then((page) => {
        if (requestId === bookRequestId.current && bankAccount?.id === accountId) setBookMovementPage(page);
      }).catch((error) => {
        if (requestId === bookRequestId.current && bankAccount?.id === accountId) {
          setBookMovementPage(null);
          setBookMovementError(error instanceof Error ? error.message : 'Could not load posted book transactions.');
        }
      }).finally(() => {
        if (requestId === bookRequestId.current && bankAccount?.id === accountId) setIsBookLoading(false);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeSourceView, bankAccount?.id, bankAccount?.ledgerAccountId, searchQuery, bookMovementOffset, refreshTrigger]);

  // Keep imported statement evidence separate from posted FirmBooks movements.
  const mergedTransactions = useMemo(() => {
    return statementRows.map((tx: any) => {
      const isCredit = tx.direction === 'CREDIT' || tx.type === 'CREDIT' || tx.type === 'DEPOSIT';
      const isDebit = tx.direction === 'DEBIT' || tx.type === 'DEBIT' || tx.type === 'WITHDRAWAL';
      return {
        id: tx.id,
        date: tx.transactionDate,
        description: tx.narration || tx.description || 'Statement Transaction',
        particulars: tx.narration || tx.description,
        reference: tx.reference || tx.referenceNumber || tx.utr || tx.chequeNumber || '—',
        counterparty: tx.counterpartyName,
        withdrawal: isDebit ? Math.abs(tx.amount) : isCredit ? null : Math.abs(tx.amount),
        deposit: isCredit ? Math.abs(tx.amount) : null,
        status: tx.reconciliationStatus || tx.status || 'TO_REVIEW',
        rawTx: tx,
      };
    });
  }, [statementRows]);

  // Tab Filtering
  const filteredTransactions = useMemo(() => {
    let list = mergedTransactions;
    if (activeTab === 'TO_REVIEW') {
      list = list.filter(
        (tx) =>
          tx.status === 'UNMATCHED' ||
          tx.status === 'TO_REVIEW' ||
          tx.status === 'RECOGNIZED' ||
          tx.status === 'PARTIALLY_MATCHED' ||
          tx.status === 'POSTED'
      );
    } else if (activeTab === 'POSSIBLE_DUPLICATES') {
      list = list.filter((tx) => tx.status === 'POSSIBLE_DUPLICATE');
    } else if (activeTab === 'MATCHED') {
      list = list.filter((tx) => tx.status === 'MATCHED');
    } else if (activeTab === 'CATEGORIZED') {
      list = list.filter((tx) => tx.status === 'CATEGORIZED');
    } else if (activeTab === 'RECONCILED') {
      list = list.filter((tx) => tx.status === 'RECONCILED');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (tx) =>
          tx.description.toLowerCase().includes(q) ||
          (tx.reference && tx.reference.toLowerCase().includes(q)) ||
          (tx.counterparty && tx.counterparty.toLowerCase().includes(q))
      );
    }

    return list;
  }, [mergedTransactions, activeTab, searchQuery]);

  // Workspace Balances (prioritize live server reconciliation response)
  const bookBalance =
    workspaceBalances?.bookBalance !== undefined && workspaceBalances?.bookBalance !== null
      ? workspaceBalances.bookBalance
      : Number(account.balance || 0);
  const statementBalance =
    workspaceBalances?.statementBalance !== undefined && workspaceBalances?.statementBalance !== null
      ? workspaceBalances.statementBalance
      : (bankAccount?.currentBalance ?? null);
  const difference =
    workspaceBalances?.difference !== undefined && workspaceBalances?.difference !== null
      ? workspaceBalances.difference
      : (statementBalance !== null ? statementBalance - bookBalance : null);
  const isBalanced = difference === 0;

  const toReviewCount = serverStatusCounts?.toReview ?? mergedTransactions.filter(
    (tx) =>
      tx.status === 'UNMATCHED' ||
      tx.status === 'TO_REVIEW' ||
      tx.status === 'RECOGNIZED' ||
      tx.status === 'PARTIALLY_MATCHED'
  ).length;
  const possibleDuplicatesCount = serverStatusCounts?.possibleDuplicates ?? mergedTransactions.filter((tx) => tx.status === 'POSSIBLE_DUPLICATE').length;

  const resolvePossibleDuplicate = async (transactionId: string, keepAsNew: boolean) => {
    setResolvingTransactionId(transactionId);
    setResolutionError(null);
    setResolutionNotice(null);
    try {
      // The existing audited ignore endpoint also restores a row to TO_REVIEW
      // when isIgnored=false. That is the explicit "keep" decision here.
      await BankingService.ignoreTransaction(transactionId, !keepAsNew);
      await loadWorkspaceTransactions();
      setActiveTab(keepAsNew ? 'TO_REVIEW' : 'ALL');
      onRefresh?.();
    } catch (error) {
      setResolutionError(error instanceof Error ? error.message : 'Could not resolve the possible duplicate.');
    } finally {
      setResolvingTransactionId(null);
    }
  };

  const loadBookSuggestions = async (transactionId: string) => {
    const requestId = ++suggestionRequestId.current;
    setSuggestionStatementId(transactionId);
    setBookSuggestions(null);
    setSuggestionError(null);
    setIsLoadingSuggestions(true);
    setResolutionError(null);
    try {
      const suggestions = await BankingService.getBookMovementSuggestions(transactionId);
      if (requestId === suggestionRequestId.current) setBookSuggestions(suggestions);
    } catch (error) {
      if (requestId === suggestionRequestId.current) {
        const apiError = error instanceof ApiRequestError ? error : null;
        setSuggestionError({
          code: apiError?.response.errorCode,
          message: bankingActionError(error, 'Could not load read-only book suggestions.'),
        });
      }
    } finally {
      if (requestId === suggestionRequestId.current) setIsLoadingSuggestions(false);
    }
  };

  const openStatementReview = async (transactionId: string, decision: 'ACCEPT' | 'KEEP_AS_NEW' | 'CONFIRM_DUPLICATE') => {
    setReviewStatementId(transactionId);
    setReviewDecision(decision);
    setDuplicateCandidates(decision === 'ACCEPT' ? [] : null);
    setDuplicateTargetId('');
    setDuplicateReason('');
    setAcknowledgeDuplicates(false);
    setResolutionError(null);
    setResolutionNotice(null);
    if (decision === 'ACCEPT') return;
    setIsLoadingDuplicates(true);
    try {
      const candidates = await BankingService.getPossibleDuplicateCandidates(transactionId);
      setDuplicateCandidates(candidates);
    } catch (error) {
      setResolutionError(bankingActionError(error, 'Could not verify possible duplicate candidates.'));
      setReviewStatementId(null);
    } finally {
      setIsLoadingDuplicates(false);
    }
  };

  const confirmStatementReview = async () => {
    if (!reviewStatementId || isReviewingStatement) return;
    const candidateIds = reviewDecision === 'KEEP_AS_NEW' ? (duplicateCandidates || []).map((candidate) => candidate.id) : [];
    setIsReviewingStatement(true);
    setResolutionError(null);
    setResolutionNotice(null);
    try {
      if (reviewDecision === 'CONFIRM_DUPLICATE') {
        await BankingService.confirmStatementDuplicate({ statementTransactionId: reviewStatementId, targetStatementTransactionId: duplicateTargetId, reason: duplicateReason });
      } else {
        await BankingService.reviewStatementTransaction({
          statementTransactionId: reviewStatementId,
          decision: reviewDecision,
          acknowledgedCandidateIds: candidateIds,
        });
      }
      setReviewStatementId(null);
      setResolutionNotice(reviewDecision === 'KEEP_AS_NEW' ? 'Duplicate reviewed and recorded as a distinct statement line.' : reviewDecision === 'CONFIRM_DUPLICATE' ? 'Duplicate recorded against the matching imported bank line.' : 'Statement line confirmed for reconciliation.');
      await loadWorkspaceTransactions();
      onRefresh?.();
    } catch (error) {
      try {
        if (reviewDecision === 'CONFIRM_DUPLICATE') throw error;
        const receipt = await BankingService.getCanonicalStatementReceipt(reviewStatementId);
        if (receipt.statementStatus === 'UNMATCHED' && receipt.reviewDecision === reviewDecision) {
          setReviewStatementId(null);
          setResolutionNotice('Statement review was saved. The confirmed line is ready for reconciliation.');
          await loadWorkspaceTransactions();
          onRefresh?.();
          return;
        }
      } catch { /* Keep the original error when no verified receipt is available. */ }
      setResolutionError(`${bankingActionError(error, 'Could not confirm this statement line.')} If the connection failed, retry the same action to check its saved result.`);
    } finally {
      setIsReviewingStatement(false);
    }
  };

  const revokeDuplicateDecision = async () => {
    if (!revokeDuplicateId || revokeDuplicateReason.trim().length < 10 || isReviewingStatement) return;
    setIsReviewingStatement(true);
    setResolutionError(null);
    try {
      await BankingService.revokeStatementDuplicate({ statementTransactionId: revokeDuplicateId, reason: revokeDuplicateReason });
      setRevokeDuplicateId(null);
      setRevokeDuplicateReason('');
      setResolutionNotice('Duplicate decision revoked. This line is back in review and must be resolved again.');
      await loadWorkspaceTransactions();
      onRefresh?.();
    } catch (error) {
      setResolutionError(bankingActionError(error, 'Could not revoke this duplicate decision.'));
    } finally {
      setIsReviewingStatement(false);
    }
  };

  const openCreateMissingEntry = async (tx: BankStatementTransaction) => {
    setCreateEntryStatementId(tx.id);
    setCreateEntryOperationId(newCreationOperationId());
    setCreateEntryExpectedRemainder(null);
    setSelectedCounterAccountId('');
    setEntryDescription(String(tx.narration || '').slice(0, 500));
    setResolutionError(null);
    setResolutionNotice(null);
    setIsLoadingCounterAccounts(true);
    setIsLoadingEntryReceipt(true);
    try {
      const [receipt, response] = await Promise.all([
        BankingService.getCanonicalStatementReceipt(tx.id),
        apiClient.get<Account[]>('/finance/accounts'),
      ]);
      if (response.error) throw new Error(response.error);
      const remainderCents = getRemainingStatementCents(tx.amount, receipt);
      setCreateEntryExpectedRemainder(centsToMoney(remainderCents));
      const allowedTypes = new Set(['EXPENSE', 'INCOME', 'REVENUE', 'OTHER INCOME', 'COST OF GOODS SOLD']);
      setCounterAccounts((response.data || []).filter((candidate) =>
        allowedTypes.has(String(candidate.type || '').toUpperCase()) &&
        String(candidate.status || 'ACTIVE').toUpperCase() === 'ACTIVE' &&
        candidate.isLocked !== true && candidate.isSystemAccount !== true &&
        candidate.allowDirectPosting !== false && !candidate.archivedAt && !candidate.isParent
      ));
    } catch (error) {
      setResolutionError(bankingActionError(error, 'Could not load posting accounts.'));
    } finally {
      setIsLoadingCounterAccounts(false);
      setIsLoadingEntryReceipt(false);
    }
  };

  const createMissingEntry = async () => {
    if (!createEntryStatementId || !createEntryOperationId || !selectedCounterAccountId || !createEntryExpectedRemainder || isCreatingEntry) return;
    setIsCreatingEntry(true);
    setResolutionError(null);
    setResolutionNotice(null);
    try {
      const statement = statementRows.find((row) => row.id === createEntryStatementId);
      if (!statement) throw new Error('Statement line is no longer available. Refresh Banking and try again.');
      const currentReceipt = await BankingService.getCanonicalStatementReceipt(createEntryStatementId);
      const currentRemainder = centsToMoney(getRemainingStatementCents(statement.amount, currentReceipt));
      if (currentRemainder !== createEntryExpectedRemainder) {
        setCreateEntryExpectedRemainder(currentRemainder);
        setResolutionError('Allocations changed while this dialog was open. Review the updated amount and confirm again.');
        return;
      }
      const result = await BankingService.createMissingEntryFromStatement({
        statementTransactionId: createEntryStatementId,
        counterAccountId: selectedCounterAccountId,
        expectedRemainderAmount: createEntryExpectedRemainder,
        creationOperationId: createEntryOperationId,
        description: entryDescription.trim() || undefined,
      });
      setCreateEntryStatementId(null);
      setResolutionNotice(`Entry posted and linked. Journal ${result.journalEntryId.slice(0, 12)} · ${formatCurrency(Number(result.amount), currencySymbol)}.`);
      await loadWorkspaceTransactions();
      onRefresh?.();
    } catch (error) {
      if (error instanceof ApiRequestError && error.response.errorCode === 'BANK_STATEMENT_REMAINDER_CHANGED') {
        try {
          const statement = statementRows.find((row) => row.id === createEntryStatementId);
          if (statement) {
            const receipt = await BankingService.getCanonicalStatementReceipt(createEntryStatementId);
            setCreateEntryExpectedRemainder(centsToMoney(getRemainingStatementCents(statement.amount, receipt)));
          }
        } catch { /* Keep the actionable conflict message when refreshed evidence is unavailable. */ }
        setResolutionError(bankingActionError(error, 'The remaining amount changed. Refresh and try again.'));
        return;
      }
      try {
        const receipt = await BankingService.getCanonicalStatementReceipt(createEntryStatementId);
        const created = receipt.allocations.find((allocation) => allocation.creationOrigin === 'STATEMENT_CREATION' &&
          allocation.creationOperationId === createEntryOperationId && allocation.allocationState === 'ACTIVE' && allocation.identityState === 'VERIFIED');
        if (created) {
          setCreateEntryStatementId(null);
          setResolutionNotice(`Entry and match were saved. Journal ${created.entryNumber || created.journalEntryId || ''} · ${formatCurrency(Number(created.amount), currencySymbol)}.`);
          await loadWorkspaceTransactions();
          onRefresh?.();
          return;
        }
      } catch { /* Keep the original error when no verified receipt is available. */ }
      setResolutionError(`${bankingActionError(error, 'Could not add this bank transaction.')} If the connection failed, retry the same action to check its saved result.`);
    } finally {
      setIsCreatingEntry(false);
    }
  };

  const confirmBookMatch = async (suggestion: BankBookMovementSuggestion) => {
    const statement = statementRows.find((row) => row.id === suggestionStatementId);
    if (!statement || allocatingMovementId) return;
    const statementAmountCents = Math.round(Math.abs(Number(statement.amount)) * 100);
    const availableAmountCents = Math.round(Math.abs(Number(suggestion.amount)) * 100);
    let alreadyAllocatedCents = 0;
    try {
      const receipt = await BankingService.getCanonicalStatementReceipt(statement.id);
      alreadyAllocatedCents = receipt.allocations
        .filter((allocation) => allocation.allocationState === 'ACTIVE' && allocation.identityState === 'VERIFIED')
        .reduce((total, allocation) => total + Math.round(Number(allocation.amount) * 100), 0);
    } catch (error) {
      setSuggestionError({ message: bankingActionError(error, 'Could not verify the amount already matched on this line. Refresh and retry.') });
      return;
    }
      const remainingStatementCents = statementAmountCents - alreadyAllocatedCents;
    const matchedAmountCents = Math.min(remainingStatementCents, availableAmountCents);
    if (!Number.isSafeInteger(matchedAmountCents) || matchedAmountCents <= 0) {
      setSuggestionError({ message: 'This candidate has no valid amount left to allocate.' });
      return;
    }
    setAllocatingMovementId(suggestion.movementId);
    setSuggestionError(null);
    setResolutionNotice(null);
    try {
      await BankingService.allocateBookMovement({
        statementTransactionId: statement.id,
        journalLineId: suggestion.movementId,
        amount: (matchedAmountCents / 100).toFixed(2),
      });
      setSuggestionStatementId(null);
      setResolutionNotice(`Match saved for journal ${suggestion.entryNumber}.`);
      await loadWorkspaceTransactions();
      onRefresh?.();
    } catch (error) {
      try {
        const receipt = await BankingService.getCanonicalStatementReceipt(statement.id);
        const saved = receipt.allocations.find((allocation) => allocation.journalLineId === suggestion.movementId && allocation.allocationState === 'ACTIVE' && allocation.identityState === 'VERIFIED');
        const savedForMovementCents = receipt.allocations
          .filter((allocation) => allocation.journalLineId === suggestion.movementId && allocation.allocationState === 'ACTIVE' && allocation.identityState === 'VERIFIED')
          .reduce((total, allocation) => total + Math.round(Number(allocation.amount) * 100), 0);
        if (saved && savedForMovementCents === matchedAmountCents) {
          setSuggestionStatementId(null);
          setResolutionNotice(`Match saved. Journal ${saved.entryNumber || saved.journalEntryId || ''} · ${formatCurrency(Number(saved.amount), currencySymbol)}.`);
          await loadWorkspaceTransactions();
          onRefresh?.();
          return;
        }
      } catch { /* Keep the original error when no verified receipt is available. */ }
      setSuggestionError({ message: `${bankingActionError(error, 'Could not confirm this match.')} If the connection failed, retry this same selection to check its saved result.` });
    } finally {
      setAllocatingMovementId(null);
    }
  };

  const openCanonicalReceipt = async (transactionId: string) => {
    setReceiptStatementId(transactionId);
    setCanonicalReceipt(null);
    setReceiptError(null);
    setIsLoadingReceipt(true);
    try {
      setCanonicalReceipt(await BankingService.getCanonicalStatementReceipt(transactionId));
    } catch (error) {
      setReceiptError(bankingActionError(error, 'Could not load the verified match receipt.'));
    } finally {
      setIsLoadingReceipt(false);
    }
  };

  const unmatchAllocation = async (allocationId: string) => {
    const reason = String(allocationReasons[allocationId] || '').trim();
    if (reason.length < 3 || mutatingAllocationId) return;
    setMutatingAllocationId(allocationId);
    setReceiptError(null);
    try {
      await BankingService.unmatchBookMovement(allocationId, reason);
      const updated = await BankingService.getCanonicalStatementReceipt(receiptStatementId!);
      setCanonicalReceipt(updated);
      setResolutionNotice('Match removed with an audit reason. The original posted journal was not changed.');
      await loadWorkspaceTransactions();
      onRefresh?.();
    } catch (error) {
      setReceiptError(bankingActionError(error, 'Could not remove this allocation.'));
    } finally {
      setMutatingAllocationId(null);
    }
  };

  const inspectLegacyMatch = async (statementId: string, matchId: string) => {
    try {
      setReceiptError(null);
      const candidate = await BankingService.getLegacyAllocationCandidate(statementId, matchId);
      setLegacyCandidates((previous) => ({ ...previous, [matchId]: candidate }));
    } catch (error) { setReceiptError(bankingActionError(error, 'This older match cannot be safely verified yet.')); }
  };

  const verifyLegacyMatch = async (statementId: string, matchId: string) => {
    const candidate = legacyCandidates[matchId];
    const reason = String(legacyReasons[matchId] || '').trim();
    if (!candidate || reason.length < 10) return;
    setMutatingAllocationId(matchId);
    try {
      await BankingService.verifyLegacyAllocation(statementId, matchId, candidate.journalLineId, reason);
      const receipt = await BankingService.getCanonicalStatementReceipt(statementId);
      setCanonicalReceipt(receipt);
      setLegacyCandidates((previous) => { const next = { ...previous }; delete next[matchId]; return next; });
    } catch (error) { setReceiptError(bankingActionError(error, 'Could not verify this older match.')); }
    finally { setMutatingAllocationId(null); }
  };

  const reverseStatementCreatedEntry = async (allocationId: string) => {
    const reason = String(allocationReasons[allocationId] || '').trim();
    if (!receiptStatementId || reason.length < 3 || mutatingAllocationId) return;
    setMutatingAllocationId(allocationId);
    setReceiptError(null);
    try {
      const reversal = await BankingService.reverseCreatedTransactionFromStatement(receiptStatementId, allocationId, reason);
      const updated = await BankingService.getCanonicalStatementReceipt(receiptStatementId);
      setCanonicalReceipt(updated);
      setResolutionNotice(`Posted entry reversed with linked journal ${reversal.reversalJournalEntryId}.`);
      await loadWorkspaceTransactions();
      onRefresh?.();
    } catch (error) {
      try {
        const receipt = await BankingService.getCanonicalStatementReceipt(receiptStatementId);
        const reversed = receipt.allocations.find((allocation) => allocation.allocationId === allocationId && allocation.allocationState === 'REVERSED' && allocation.reversalJournalEntryId);
        if (reversed) {
          setCanonicalReceipt(receipt);
          setResolutionNotice(`Posted entry reversal was saved. Journal ${reversed.reversalEntryNumber || reversed.reversalJournalEntryId}.`);
          await loadWorkspaceTransactions();
          onRefresh?.();
          return;
        }
      } catch { /* Keep the original error if no verified reversal receipt is available. */ }
      setReceiptError(bankingActionError(error, 'Could not reverse this posted entry.'));
    } finally {
      setMutatingAllocationId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. BREADCRUMB & BACK BUTTON */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBackToOverview}
          className="inline-flex items-center space-x-2 text-xs font-bold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Bank Accounts</span>
        </button>

        <span className="text-[11px] font-mono font-semibold text-slate-400">
          Account ID: #{account.code || account.id.slice(0, 6)}
        </span>
      </div>

      {/* 2. ACCOUNT HEADER BANNER */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 flex items-center justify-center shrink-0">
              {account.subType === 'Credit Card' || account.subType === 'Credit Cards' ? (
                <CreditCard className="w-6 h-6" />
              ) : account.subType === 'Cash' || account.subType === 'Cash & Bank' ? (
                <Wallet className="w-6 h-6" />
              ) : (
                <Landmark className="w-6 h-6" />
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-black text-slate-900 dark:text-white">
                  {account.name}
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold">
                  {bankAccount?.accountNumber ? `•••• ${bankAccount.accountNumber.slice(-4)}` : `#${account.code}`}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {account.status || 'Active'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                {bankAccount?.bankName || 'Bank Account'} • {account.subType || account.type}
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={onImportStatement}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center space-x-2 shadow-sm cursor-pointer transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Import Statement</span>
            </button>

            <button
              onClick={onReconcile}
              className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl flex items-center space-x-1.5 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-indigo-600" />
              <span>Reconcile</span>
            </button>

            <button
              onClick={onTransferFunds}
              className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl flex items-center space-x-1.5 cursor-pointer transition-colors"
            >
              <ArrowDownLeft className="w-4 h-4 text-violet-600 rotate-[-90deg]" />
              <span>Transfer Funds</span>
            </button>

            <button
              onClick={onRecordTransaction}
              className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl flex items-center space-x-1.5 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Record Transaction</span>
            </button>
          </div>
        </div>

        {/* 3. ZOHO BOOKS 3 BALANCE CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-4 border-t border-slate-200/80 dark:border-slate-800">
          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Amount in FirmBooks
            </span>
            <div className="text-xl font-black font-mono text-slate-900 dark:text-white mt-1">
              {formatCurrency(bookBalance, currencySymbol)}
            </div>
            <span className="text-[10px] text-slate-400">General Ledger Balance</span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Amount in Bank
            </span>
            <div className="text-xl font-black font-mono text-blue-700 dark:text-blue-300 mt-1">
              {statementBalance !== null ? formatCurrency(statementBalance, currencySymbol) : 'No statement'}
            </div>
            <span className="text-[10px] text-slate-400">
              {statementBalance !== null ? 'Latest statement closing balance' : 'Import statement to update'}
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Difference
            </span>
            <div className="text-xl font-black font-mono text-slate-900 dark:text-white mt-1">
              {difference === null ? (
                <span className="text-slate-400">—</span>
              ) : isBalanced ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                  <CheckCircle2 className="w-5 h-5 inline-block mr-1" />
                  <span>{formatCurrency(0, currencySymbol)}</span>
                </span>
              ) : (
                <span className="text-rose-600 dark:text-rose-400">
                  {formatCurrency(difference, currencySymbol)}
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400">
              {isBalanced ? 'Books are fully reconciled' : 'Unreconciled discrepancy'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setActiveSourceView('STATEMENT')}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold ${activeSourceView === 'STATEMENT' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
        >
          Imported Bank Statement
        </button>
        <button
          type="button"
          onClick={() => { setBookMovementOffset(0); setActiveSourceView('BOOKS'); }}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold ${activeSourceView === 'BOOKS' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
        >
          Transactions in FirmBooks
        </button>
        <span className="ml-auto px-2 text-[11px] text-slate-500 dark:text-slate-400">
          Posted ledger activity is read-only here. Reversals appear as separate entries.
        </span>
      </div>

      {/* 4. TABS & SEARCH TOOLBAR */}
      {resolutionNotice && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
        <span>{resolutionNotice}</span>
        <button type="button" onClick={() => setResolutionNotice(null)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss banking update"><XCircle className="h-4 w-4" /></button>
      </div>}
      {resolutionError && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <span>{resolutionError}</span>
          <button type="button" onClick={() => setResolutionError(null)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss duplicate resolution error">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-1 overflow-x-auto">
          <button
            onClick={() => { setStatementOffset(0); setActiveTab('ALL'); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'ALL'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Transactions ({searchQuery.trim() ? workspaceFilteredRows : workspaceTotalRows})
          </button>
          <button
            onClick={() => { setStatementOffset(0); setActiveTab('TO_REVIEW'); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'TO_REVIEW'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            To Review ({toReviewCount})
          </button>
          {possibleDuplicatesCount > 0 && (
            <button
              onClick={() => { setStatementOffset(0); setActiveTab('POSSIBLE_DUPLICATES'); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'POSSIBLE_DUPLICATES'
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs'
                  : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
              }`}
            >
              Possible duplicates ({possibleDuplicatesCount})
            </button>
          )}
          <button
            onClick={() => { setStatementOffset(0); setActiveTab('MATCHED'); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'MATCHED'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Matched ({serverStatusCounts?.matched ?? '—'})
          </button>
          <button
            onClick={() => { setStatementOffset(0); setActiveTab('CATEGORIZED'); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'CATEGORIZED'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Categorized ({serverStatusCounts?.categorized ?? '—'})
          </button>
          <button
            onClick={() => { setStatementOffset(0); setActiveTab('RECONCILED'); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'RECONCILED'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Reconciled ({serverStatusCounts?.reconciled ?? '—'})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search description, reference, party..."
              value={searchQuery}
              onChange={(e) => { setBookMovementOffset(0); setStatementOffset(0); setSearchQuery(e.target.value); }}
              className="w-full sm:w-64 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold pl-9 pr-3 py-2 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => {
              void loadWorkspaceTransactions();
              onRefresh?.();
            }}
            disabled={isLoading}
            className="p-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
            title="Refresh transactions"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {activeSourceView === 'STATEMENT' ? <>
      {/* 5. Imported statement transactions */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="mobile-record-table w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="py-3.5 px-5">Date</th>
                <th className="py-3.5 px-5">Particulars / Description</th>
                <th className="py-3.5 px-5 text-right">Withdrawals (DR)</th>
                <th className="py-3.5 px-5 text-right">Deposits (CR)</th>
                <th className="py-3.5 px-5 text-center">Status</th>
                <th className="sticky right-0 z-10 bg-slate-50 py-3.5 px-5 text-right shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] dark:bg-slate-950">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <History className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="font-bold text-slate-700 dark:text-slate-300">
                      No transactions found for this filter
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Import a CSV or spreadsheet statement to see bank evidence here. General-ledger activity stays separate until you explicitly match it.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isUnmatched =
                    tx.status === 'UNMATCHED' || tx.status === 'TO_REVIEW' || tx.status === 'RECOGNIZED' || tx.status === 'POSTED' || tx.status === 'PARTIALLY_MATCHED';
                  const isMatched = tx.status === 'MATCHED';
                  const isPartiallyMatched = tx.status === 'PARTIALLY_MATCHED';
                  const isCategorized = tx.status === 'CATEGORIZED';
                  const isReconciled = tx.status === 'RECONCILED';
                  const isPossibleDuplicate = tx.status === 'POSSIBLE_DUPLICATE';
                  const isConfirmedDuplicate = tx.status === 'CONFIRMED_DUPLICATE';
                  const needsReview = tx.status === 'TO_REVIEW' || tx.status === 'RECOGNIZED';
                  const isCanonicalUnmatched = tx.status === 'UNMATCHED';
                  const isCanonicalAllocatable = isCanonicalUnmatched || isPartiallyMatched;
                  const isResolving = resolvingTransactionId === tx.id;

                  return (
                    <tr
                      key={tx.id}
                      onClick={() => onSelectTxDetails(tx.rawTx)}
                      className="hover:bg-blue-50/40 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                    >
                      {/* 1. DATE */}
                      <td className="py-3.5 px-5 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDate(tx.date)}
                      </td>

                      {/* 2. PARTICULARS / DESCRIPTION */}
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {tx.particulars || tx.description}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                          {tx.reference && tx.reference !== '—' && (
                            <span className="font-mono">{tx.reference}</span>
                          )}
                          {tx.counterparty && (
                            <>
                              <span>•</span>
                              <span>{tx.counterparty}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* 3. WITHDRAWALS (DR) */}
                      <td className="py-3.5 px-5 text-right font-mono font-bold whitespace-nowrap">
                        {tx.withdrawal ? (
                          <span className="text-slate-900 dark:text-slate-100">
                            {formatCurrency(tx.withdrawal, currencySymbol)}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>

                      {/* 4. DEPOSITS (CR) */}
                      <td className="py-3.5 px-5 text-right font-mono font-bold whitespace-nowrap">
                        {tx.deposit ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{formatCurrency(tx.deposit, currencySymbol)}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>

                      {/* 5. STATUS */}
                      <td className="py-3.5 px-5 text-center whitespace-nowrap">
                        {isPossibleDuplicate ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                            Possible duplicate
                          </span>
                        ) : isPartiallyMatched ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">Partially matched</span>
                        ) : isUnmatched ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            Uncategorized
                          </span>
                        ) : isMatched ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                            Matched
                          </span>
                        ) : isCategorized ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                            Categorized
                          </span>
                        ) : isReconciled ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Reconciled
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            {tx.status || 'Posted'}
                          </span>
                        )}
                      </td>

                      {/* 6. ACTIONS */}
                      <td
                        className="mobile-record-actions sticky right-0 z-[1] bg-white py-3.5 px-5 text-right shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] group-hover:bg-blue-50 dark:bg-slate-900 dark:group-hover:bg-slate-800"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end space-x-1.5">
                          {isPossibleDuplicate ? (
                            <>
                              <button
                                type="button"
                                disabled={isResolving}
                                onClick={() => void (canonicalBankWritesEnabled
                                  ? openStatementReview(tx.id, 'KEEP_AS_NEW')
                                  : resolvePossibleDuplicate(tx.id, true))}
                                className="px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-50 inline-flex items-center space-x-1 whitespace-nowrap"
                                title="Keep this row and move it to To Review"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{isResolving ? 'Saving…' : canonicalBankWritesEnabled ? 'Review duplicate' : 'Keep as new'}</span>
                              </button>
                              <button
                                type="button"
                                disabled={isResolving}
                                onClick={() => void (canonicalBankWritesEnabled ? openStatementReview(tx.id, 'CONFIRM_DUPLICATE') : resolvePossibleDuplicate(tx.id, false))}
                                className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-50 inline-flex items-center space-x-1"
                                title="Confirm this is the same bank transaction as another imported line"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>{canonicalBankWritesEnabled ? 'Confirm duplicate' : 'Ignore'}</span>
                              </button>
                            </>
                          ) : isConfirmedDuplicate && canonicalBankWritesEnabled ? (
                            <button type="button" onClick={() => { setRevokeDuplicateId(tx.id); setRevokeDuplicateReason(''); setResolutionError(null); }} className="px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40 rounded-lg transition-colors">Correct duplicate</button>
                          ) : isMatched && canonicalBankWritesEnabled ? (
                            <button type="button" onClick={() => void openCanonicalReceipt(tx.id)} className="px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer inline-flex items-center space-x-1"><Link2 className="w-3.5 h-3.5" /><span>Manage match</span></button>
                          ) : isUnmatched && (
                            <>
                              {canonicalBankWritesEnabled ? (
                                needsReview ? (
                                  <button
                                    type="button"
                                    disabled={isReviewingStatement}
                                    onClick={() => void openStatementReview(tx.id, 'ACCEPT')}
                                    className="px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40 rounded-lg transition-colors cursor-pointer inline-flex items-center space-x-1 disabled:opacity-50"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Confirm line</span>
                                  </button>
                                ) : isCanonicalAllocatable ? (
                                  <>
                                    {bankAccount?.ledgerAccountId && <button
                                      type="button"
                                      onClick={() => void loadBookSuggestions(tx.id)}
                                      className="px-2.5 py-1 text-xs font-bold text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40 rounded-lg transition-colors cursor-pointer inline-flex items-center space-x-1"
                                      title="Compare this line with posted FirmBooks bank movements"
                                    ><BookOpen className="w-3.5 h-3.5" /><span>Find match</span></button>}
                                    {statementEntryCreationEnabled && isCanonicalAllocatable && <button
                                      type="button"
                                      onClick={() => void openCreateMissingEntry(tx.rawTx)}
                                      className="px-2.5 py-1 text-xs font-bold text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-950/40 rounded-lg transition-colors cursor-pointer inline-flex items-center space-x-1"
                                      title="Record a simple bank-paid expense or bank-received income"
                                    ><Plus className="w-3.5 h-3.5" /><span>{isPartiallyMatched ? 'Add missing amount' : 'Add simple entry'}</span></button>}
                                  </>
                                ) : null
                              ) : (
                                <>
                                  {bankAccount?.ledgerAccountId && (
                                    <button type="button" onClick={() => void loadBookSuggestions(tx.id)} className="px-2.5 py-1 text-xs font-bold text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40 rounded-lg transition-colors cursor-pointer inline-flex items-center space-x-1" title="Find read-only suggestions from posted FirmBooks ledger activity">
                                      <BookOpen className="w-3.5 h-3.5" /><span>Book suggestions</span>
                                    </button>
                                  )}
                                  <button type="button" onClick={() => onOpenMatch(tx.rawTx)} className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer inline-flex items-center space-x-1"><Link2 className="w-3.5 h-3.5" /><span>Match</span></button>
                                  <button type="button" onClick={() => onOpenCategorize(tx.rawTx)} className="px-2.5 py-1 text-xs font-bold text-purple-600 hover:text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg transition-colors cursor-pointer inline-flex items-center space-x-1"><FileCheck2 className="w-3.5 h-3.5" /><span>Categorize</span></button>
                                </>
                              )}
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => onSelectTxDetails(tx.rawTx)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="View details"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-900">
        <span className="text-slate-500">Showing {workspaceFilteredRows === 0 ? 0 : statementOffset + 1}–{Math.min(statementOffset + statementRows.length, workspaceFilteredRows)} of {workspaceFilteredRows} matching statement lines · {workspaceTotalRows} total imported</span>
        <div className="flex gap-2"><button type="button" disabled={statementOffset === 0 || isLoading} onClick={() => setStatementOffset((offset) => Math.max(0, offset - 100))} className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-slate-700 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200">Previous</button><button type="button" disabled={statementOffset + statementRows.length >= workspaceFilteredRows || isLoading} onClick={() => setStatementOffset((offset) => offset + 100)} className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-slate-700 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200">Next</button></div>
      </div>
      </> : <section className="space-y-3">
        {!bankAccount?.ledgerAccountId ? (
          <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            Transactions in FirmBooks cannot be shown because this bank profile has no explicit ledger account link. Link the bank profile to its ledger account in account settings.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Posted movements</div>
                <div className="mt-1 text-xl font-black text-slate-900 dark:text-white">{bookMovementError ? '—' : bookMovementPage?.total ?? (isBookLoading ? '…' : '0')}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Total debits · money into bank</div>
                <div className="mt-1 text-lg font-black text-emerald-700 dark:text-emerald-300">{bookMovementPage && !bookMovementError ? formatCurrency(bookMovementPage.inflowTotal, bookMovementPage.currency) : '—'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Total credits · money out of bank</div>
                <div className="mt-1 text-lg font-black text-slate-900 dark:text-white">{bookMovementPage && !bookMovementError ? formatCurrency(bookMovementPage.outflowTotal, bookMovementPage.currency) : '—'}</div>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    <th className="px-5 py-3.5">Date</th><th className="px-5 py-3.5">Journal / Description</th><th className="px-5 py-3.5">Reference</th><th className="px-5 py-3.5 text-right">Debit</th><th className="px-5 py-3.5 text-right">Credit</th><th className="px-5 py-3.5 text-center">Entry state</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {isBookLoading ? <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">Loading posted ledger activity…</td></tr>
                      : bookMovementError ? <tr><td colSpan={6} role="alert" className="px-5 py-12 text-center font-semibold text-rose-700 dark:text-rose-300">{bookMovementError}</td></tr>
                      : !bookMovementPage?.movements.length ? <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">No posted ledger movements found for this bank account.</td></tr>
                        : bookMovementPage.movements.map((movement: BankBookMovement) => <tr key={movement.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="whitespace-nowrap px-5 py-3.5 font-mono text-slate-600 dark:text-slate-300">{formatDate(movement.date)}</td>
                          <td className="px-5 py-3.5"><div className="font-semibold text-slate-900 dark:text-white">{movement.entryNumber}</div><div className="mt-0.5 text-[11px] text-slate-500">{movement.lineDescription || movement.description || 'Posted journal entry'}</div></td>
                          <td className="px-5 py-3.5 font-mono text-slate-500">{movement.reference || '—'}</td>
                          <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-300">{movement.debit ? formatCurrency(movement.debit, movement.currency) : '—'}</td>
                          <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">{movement.credit ? formatCurrency(movement.credit, movement.currency) : '—'}</td>
                          <td className="px-5 py-3.5 text-center"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${movement.isReversal ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'}`}>{movement.isReversal ? 'Posted reversal' : 'Posted'}</span></td>
                        </tr>)}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs dark:border-slate-800">
                <span className="text-slate-500">{bookMovementPage ? `Showing ${bookMovementPage.total === 0 ? 0 : bookMovementPage.offset + 1}–${Math.min(bookMovementPage.offset + bookMovementPage.movements.length, bookMovementPage.total)} of ${bookMovementPage.total}` : ' '}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={bookMovementOffset === 0 || isBookLoading} onClick={() => setBookMovementOffset((offset) => Math.max(0, offset - 25))} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">Previous</button>
                  <button type="button" disabled={!bookMovementPage?.hasMore || isBookLoading} onClick={() => setBookMovementOffset((offset) => offset + 25)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">Next</button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>}
      {reviewStatementId && (() => {
        const statement = statementRows.find((row) => row.id === reviewStatementId);
        return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isReviewingStatement) setReviewStatementId(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="statement-review-title" className="max-h-[85vh] w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-200 p-5 dark:border-slate-800"><h2 id="statement-review-title" className="text-base font-black text-slate-900 dark:text-white">{reviewDecision === 'KEEP_AS_NEW' ? 'Review possible duplicate' : reviewDecision === 'CONFIRM_DUPLICATE' ? 'Confirm duplicate bank line' : 'Confirm statement line'}</h2><p className="mt-1 text-xs text-slate-500">{reviewDecision === 'CONFIRM_DUPLICATE' ? 'This links two imported observations of the same bank movement. The original line must still be fully reconciled before close.' : 'This review changes only statement-line status. It does not post to the ledger.'}</p></div>
            {statement && <div className="space-y-4 overflow-y-auto p-5">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex justify-between gap-3"><div><div className="font-bold text-slate-900 dark:text-white">{formatDate(statement.transactionDate)} · {statement.narration}</div><div className="mt-1 text-xs text-slate-500">{statement.direction}{statement.reference ? ` · Ref ${statement.reference}` : ''}</div></div><strong className="whitespace-nowrap font-mono text-slate-900 dark:text-white">{formatCurrency(Math.abs(Number(statement.amount)), currencySymbol)}</strong></div></div>
              {reviewDecision !== 'ACCEPT' && <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-200">Possible matching lines</h3>
                {isLoadingDuplicates ? <p className="py-5 text-center text-xs text-slate-500">Checking nearby statement lines…</p>
                  : !duplicateCandidates?.length ? <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">No candidate rows are available. This line cannot be marked as a distinct duplicate candidate until the comparison can be verified.</p>
                    : <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">{duplicateCandidates.map((candidate) => <label key={candidate.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs dark:border-amber-900/60 dark:bg-amber-950/20"><input type={reviewDecision === 'CONFIRM_DUPLICATE' ? 'radio' : 'checkbox'} name="duplicate-target" checked={reviewDecision === 'CONFIRM_DUPLICATE' ? duplicateTargetId === candidate.id : acknowledgeDuplicates} onChange={() => reviewDecision === 'CONFIRM_DUPLICATE' ? setDuplicateTargetId(candidate.id) : setAcknowledgeDuplicates(true)} className="mt-0.5" /><span className="min-w-0 flex-1"><span className="flex justify-between gap-3"><strong>{formatDate(candidate.transactionDate)} · {candidate.narration || 'Statement line'}</strong><strong className="whitespace-nowrap font-mono">{formatCurrency(Number(candidate.amount), currencySymbol)}</strong></span><span className="mt-1 block text-slate-600 dark:text-slate-400">{candidate.direction} · {candidate.reconciliationStatus}{candidate.reference ? ` · Ref ${candidate.reference}` : ''}</span></span></label>)}</div>}
                {reviewDecision === 'KEEP_AS_NEW' && !!duplicateCandidates?.length && <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300"><input type="checkbox" checked={acknowledgeDuplicates} onChange={(event) => setAcknowledgeDuplicates(event.target.checked)} className="mt-0.5" /><span>I reviewed these candidates and confirm this is a separate real bank transaction.</span></label>}
                {reviewDecision === 'CONFIRM_DUPLICATE' && <label className="mt-3 block text-xs font-semibold text-slate-700 dark:text-slate-300">Why are these the same bank transaction?<textarea value={duplicateReason} onChange={(event) => setDuplicateReason(event.target.value)} minLength={10} maxLength={1000} rows={3} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="For example, the same reference and amount appeared in overlapping statement imports." /></label>}
              </div>}
              {reviewDecision === 'ACCEPT' && <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">Confirm only after checking this imported line belongs to this bank account and is not a duplicate. You can then match it to posted books or record a simple income/expense.</p>}
            </div>}
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800"><button type="button" disabled={isReviewingStatement} onClick={() => setReviewStatementId(null)} className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Cancel</button><button type="button" disabled={isReviewingStatement || isLoadingDuplicates || (reviewDecision === 'KEEP_AS_NEW' && (!duplicateCandidates?.length || !acknowledgeDuplicates)) || (reviewDecision === 'CONFIRM_DUPLICATE' && (!duplicateTargetId || duplicateReason.trim().length < 10))} onClick={() => void confirmStatementReview()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isReviewingStatement ? 'Saving…' : reviewDecision === 'KEEP_AS_NEW' ? 'Confirm this is new' : reviewDecision === 'CONFIRM_DUPLICATE' ? 'Confirm same transaction' : 'Confirm genuine line'}</button></div>
          </section>
        </div>;
      })()}
      {revokeDuplicateId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isReviewingStatement) setRevokeDuplicateId(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="revoke-duplicate-title" className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
          <div className="border-b border-slate-200 p-5 dark:border-slate-800"><h2 id="revoke-duplicate-title" className="font-black text-slate-900 dark:text-white">Correct duplicate decision</h2><p className="mt-1 text-xs text-slate-500">This reopens the imported line for review. A completed reconciliation must be reopened first.</p></div>
          <div className="p-5"><label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Reason for correction<textarea value={revokeDuplicateReason} onChange={(event) => setRevokeDuplicateReason(event.target.value)} minLength={10} maxLength={1000} rows={3} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label></div>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800"><button type="button" disabled={isReviewingStatement} onClick={() => setRevokeDuplicateId(null)} className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Cancel</button><button type="button" disabled={isReviewingStatement || revokeDuplicateReason.trim().length < 10} onClick={() => void revokeDuplicateDecision()} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{isReviewingStatement ? 'Saving…' : 'Revoke duplicate decision'}</button></div>
        </section>
      </div>}
      {createEntryStatementId && (() => {
        const statement = statementRows.find((row) => row.id === createEntryStatementId);
        return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isCreatingEntry) setCreateEntryStatementId(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="create-statement-entry-title" className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-200 p-5 dark:border-slate-800"><h2 id="create-statement-entry-title" className="text-base font-black text-slate-900 dark:text-white">Record simple {statement?.direction === 'DEBIT' ? 'expense' : 'income'}</h2><p className="mt-1 text-xs text-slate-500">A balanced journal and statement allocation are created atomically. No bank balance is inferred from the statement.</p></div>
            {statement && <div className="space-y-4 p-5">{resolutionError && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{resolutionError}</div>}<div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60"><div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{formatDate(statement.transactionDate)} · {statement.narration}</div><div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Amount to post</div><div className="font-mono font-black text-slate-900 dark:text-white">{isLoadingEntryReceipt ? 'Checking current matches…' : createEntryExpectedRemainder ? formatCurrency(Number(createEntryExpectedRemainder), currencySymbol) : 'Amount unavailable'}</div></div>
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">Use this for a simple bank-paid expense or bank-received income. Customer/vendor settlements, tax, transfers, refunds, advances, and prepayments must be recorded in their normal FirmBooks module, then matched here.</p>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">{statement.direction === 'DEBIT' ? 'Expense account' : 'Income account'}
                <select value={selectedCounterAccountId} onChange={(event) => setSelectedCounterAccountId(event.target.value)} disabled={isLoadingCounterAccounts || isCreatingEntry} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="">{isLoadingCounterAccounts ? 'Loading accounts…' : 'Choose an account'}</option>{counterAccounts.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.code} · {candidate.name} ({candidate.type})</option>)}</select>
              </label>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Description<input maxLength={500} value={entryDescription} onChange={(event) => setEntryDescription(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
            </div>}
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800"><button type="button" disabled={isCreatingEntry} onClick={() => setCreateEntryStatementId(null)} className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Cancel</button><button type="button" disabled={isCreatingEntry || isLoadingCounterAccounts || isLoadingEntryReceipt || !createEntryExpectedRemainder || !selectedCounterAccountId} onClick={() => void createMissingEntry()} className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isCreatingEntry ? 'Posting…' : 'Post and link entry'}</button></div>
          </section>
        </div>;
      })()}
      {suggestionStatementId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { suggestionRequestId.current += 1; setSuggestionStatementId(null); } }}>
          <section role="dialog" aria-modal="true" aria-labelledby="book-suggestions-title" className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800">
              <div><h2 id="book-suggestions-title" className="text-base font-black text-slate-900 dark:text-white">Possible FirmBooks matches</h2><p className="mt-1 text-xs text-slate-500">Suggestions compare this statement line with posted ledger movements. They do not create or confirm a match.</p></div>
              <button type="button" onClick={() => { suggestionRequestId.current += 1; setSuggestionStatementId(null); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close suggestions"><XCircle className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
              {suggestionError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"><div>{suggestionError.code === 'BANK_CURRENCY_UNSUPPORTED' ? 'Currency unsupported or unverified' : 'Suggestions unavailable'}</div><p className="mt-1 text-xs font-normal">{suggestionError.message}</p></div>
                : isLoadingSuggestions ? <p className="py-8 text-center text-sm text-slate-500">Finding posted ledger candidates…</p>
                : !bookSuggestions?.length ? <p className="py-8 text-center text-sm text-slate-500">No likely posted ledger candidates were found. You can still review Transactions in FirmBooks separately.</p>
                  : bookSuggestions.map((suggestion) => {
                    const selectedStatement = statementRows.find((row) => row.id === suggestionStatementId);
                    const statementCents = Math.round(Math.abs(Number(selectedStatement?.amount || 0)) * 100);
                    const bookCents = Math.round(Math.abs(Number(suggestion.amount)) * 100);
                    const proposalCents = Math.min(statementCents, bookCents);
                    const isPartialProposal = proposalCents > 0 && proposalCents < statementCents;
                    return <article key={suggestion.movementId} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold text-slate-900 dark:text-white">{suggestion.entryNumber} · {formatDate(suggestion.date)}</div><div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{suggestion.description || 'Posted journal movement'}{suggestion.reference ? ` · Ref ${suggestion.reference}` : ''}</div><div className="mt-2 text-[11px] text-slate-500">{suggestion.reasons.join(' · ')}</div></div><div className="text-right"><div className="font-mono font-black text-slate-900 dark:text-white">{formatCurrency(suggestion.amount, currencySymbol)}</div><div className="mt-1 text-[10px] font-bold uppercase text-violet-700 dark:text-violet-300">{suggestion.confidenceScore}% suggestion</div></div></div>
                    <div className="mt-3 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Review only · {suggestion.movementId}</div>
                    {canonicalBankWritesEnabled && selectedStatement && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <p className="text-[11px] text-slate-500">{isPartialProposal ? `This will match ${formatCurrency(proposalCents / 100, currencySymbol)} and leave the rest unresolved.` : `This will match ${formatCurrency(proposalCents / 100, currencySymbol)}.`}</p>
                      <button type="button" disabled={allocatingMovementId !== null || proposalCents <= 0} onClick={() => void confirmBookMatch(suggestion)} className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-50">
                        {allocatingMovementId === suggestion.movementId ? 'Saving match…' : isPartialProposal ? 'Confirm partial match' : 'Confirm match'}
                      </button>
                    </div>}
                  </article>})}
            </div>
            <div className="border-t border-slate-200 px-5 py-3 text-right dark:border-slate-800"><button type="button" onClick={() => { suggestionRequestId.current += 1; setSuggestionStatementId(null); }} className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Close</button></div>
          </section>
        </div>
      )}
      {receiptStatementId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !mutatingAllocationId) setReceiptStatementId(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="match-receipt-title" className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 id="match-receipt-title" className="text-base font-black text-slate-900 dark:text-white">Verified match details</h2><p className="mt-1 text-xs text-slate-500">Posted ledger identities and audit state for this imported line.</p></div><button type="button" disabled={!!mutatingAllocationId} onClick={() => setReceiptStatementId(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close match details"><XCircle className="h-5 w-5" /></button></div>
            <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
              {receiptError && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{receiptError}</div>}
              {isLoadingReceipt ? <p className="py-8 text-center text-sm text-slate-500">Loading verified match receipt…</p> : canonicalReceipt?.allocations.map((allocation) => {
                const active = allocation.allocationState === 'ACTIVE' && allocation.identityState === 'VERIFIED';
                const reason = String(allocationReasons[allocation.allocationId] || '').trim();
                return <article key={allocation.allocationId} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap justify-between gap-2"><div><div className="font-bold text-slate-900 dark:text-white">{allocation.entryNumber || allocation.journalEntryId} · {formatCurrency(Number(allocation.amount), currencySymbol)}</div><div className="mt-1 text-xs text-slate-500">Journal line {allocation.journalLineId} · {allocation.creationOrigin} · {allocation.allocationState} / {allocation.identityState}</div>{allocation.reversalJournalEntryId && <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Reversal: {allocation.reversalEntryNumber || allocation.reversalJournalEntryId}</div>}</div></div>
                  {active && (allocation.creationOrigin === 'CANONICAL_ALLOCATION' || allocation.creationOrigin === 'LEGACY_VERIFIED' || allocation.creationOrigin === 'STATEMENT_CREATION') && <div className="mt-3 w-full border-t border-slate-100 pt-3 dark:border-slate-800"><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Reason (required)<input value={allocationReasons[allocation.allocationId] || ''} onChange={(event) => setAllocationReasons((previous) => ({ ...previous, [allocation.allocationId]: event.target.value }))} maxLength={500} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label><button type="button" disabled={reason.length < 3 || !!mutatingAllocationId} onClick={() => void (allocation.creationOrigin === 'STATEMENT_CREATION' ? reverseStatementCreatedEntry(allocation.allocationId) : unmatchAllocation(allocation.allocationId))} className="mt-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{mutatingAllocationId === allocation.allocationId ? 'Saving…' : allocation.creationOrigin === 'STATEMENT_CREATION' ? 'Reverse posted entry' : 'Unmatch allocation'}</button></div>}
                </article>;
              })}
              {!isLoadingReceipt && canonicalReceipt?.legacyMatches.map((legacy) => {
                const candidate = legacyCandidates[legacy.matchId];
                const reason = String(legacyReasons[legacy.matchId] || '').trim();
                return <article key={legacy.matchId} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                  <div className="font-bold text-slate-900 dark:text-white">Older match · {formatCurrency(Number(legacy.amount), currencySymbol)}</div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{legacy.sourceType} · {legacy.sourceId} · {legacy.status || 'unresolved'}</div>
                  {!candidate ? <button type="button" disabled={!canonicalBankWritesEnabled || !!mutatingAllocationId} onClick={() => void inspectLegacyMatch(receiptStatementId, legacy.matchId)} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Check posted journal evidence</button> : <>
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">Candidate: {candidate.entryNumber} · {candidate.journalDate} · line {candidate.journalLineId} (capacity {formatCurrency(Number(candidate.lineCapacity), currencySymbol)})</div>
                    <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">Why does this bank line match this posted entry? (required)<input value={legacyReasons[legacy.matchId] || ''} onChange={(event) => setLegacyReasons((previous) => ({ ...previous, [legacy.matchId]: event.target.value }))} maxLength={1000} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
                    <button type="button" disabled={!canonicalBankWritesEnabled || reason.length < 10 || !!mutatingAllocationId} onClick={() => void verifyLegacyMatch(receiptStatementId, legacy.matchId)} className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{mutatingAllocationId === legacy.matchId ? 'Verifying…' : 'Verify and keep existing match'}</button>
                  </>}
                </article>;
              })}
              {!isLoadingReceipt && canonicalReceipt && canonicalReceipt.allocations.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No canonical allocations are recorded for this statement line.</p>}
            </div>
            <div className="border-t border-slate-200 px-5 py-3 text-right dark:border-slate-800"><button type="button" disabled={!!mutatingAllocationId} onClick={() => setReceiptStatementId(null)} className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Close</button></div>
          </section>
        </div>
      )}
    </div>
  );
};
