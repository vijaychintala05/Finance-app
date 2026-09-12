export type BankStatementSourceFormat = 'CSV' | 'XLSX' | 'XLS' | 'OFX' | 'MT940' | 'CAMT053';

export type BankTransactionDirection = 'CREDIT' | 'DEBIT';

export type BankReconciliationStatus =
  | 'UNMATCHED'
  | 'SUGGESTED'
  | 'PARTIALLY_MATCHED'
  | 'MATCHED'
  | 'RECONCILED'
  | 'IGNORED'
  | 'NEEDS_REVIEW'
  | 'TO_REVIEW'
  | 'RECOGNIZED'
  | 'CATEGORIZED'
  | 'POSSIBLE_DUPLICATE';

export type AccountingTransactionType =
  | 'invoice'
  | 'payment_received'
  | 'bill'
  | 'payment_made'
  | 'expense'
  | 'transfer'
  | 'journal'
  | 'customer_refund'
  | 'vendor_refund';

export interface BankAccount {
  id: string;
  organizationId: string;
  ledgerAccountId?: string;
  accountName: string;
  accountNumber: string;
  maskedAccountNumber: string;
  bankName: string;
  accountType: 'Checking' | 'Savings' | 'Credit Card' | 'Overdraft';
  currency: string;
  country: string;
  currentBalance: number;
  openingBalanceDate?: string;
  statementImportEnabled: boolean;
  status: 'Active' | 'Inactive';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankStatementImport {
  id: string;
  organizationId: string;
  bankAccountId: string;
  sourceFormat: BankStatementSourceFormat;
  originalFilename: string;
  fileHash: string;
  parserVersion: string;
  statementFrom?: string;
  statementTo?: string;
  openingBalance: number;
  closingBalance: number;
  currency: string;
  importedBy?: string;
  importedAt: string;
  transactionCount: number;
  status: 'Completed' | 'Failed' | 'Duplicate';
}

export interface BankStatementTransaction {
  id: string;
  organizationId: string;
  bankAccountId: string;
  statementImportId: string;
  transactionDate: string;
  valueDate?: string;
  amount: number;
  direction: BankTransactionDirection;
  runningBalance?: number;
  narration: string;
  reference?: string;
  transactionType?: string; // UPI, NEFT, RTGS, IMPS, Cheque, Fee, Interest, Transfer
  utr?: string;
  rrn?: string;
  upiReference?: string;
  chequeNumber?: string;
  counterpartyName?: string;
  counterpartyAccountMasked?: string;
  currency: string;
  reconciliationStatus: BankReconciliationStatus;
  fingerprint: string;
  rawData?: Record<string, any>;
  createdAt: string;
}

export interface MatchReason {
  code: string;
  description: string;
  weight: number;
}

export interface MatchSuggestion {
  accountingTransactionType: AccountingTransactionType;
  accountingTransactionId: string;
  confidenceScore: number; // 0 to 100
  matchedAmount: number;
  reasons: MatchReason[];
  details: {
    referenceNumber?: string;
    entityName?: string;
    date?: string;
    totalAmount?: number;
    description?: string;
  };
}

export interface BankReconciliationMatch {
  id: string;
  organizationId: string;
  statementTransactionId: string;
  accountingTransactionType: AccountingTransactionType;
  accountingTransactionId: string;
  matchedAmount: number;
  matchConfidence: number;
  matchReasons: MatchReason[];
  matchedBy?: string;
  matchedAt: string;
  status: 'MATCHED' | 'RECONCILED' | 'UNMATCHED';
}

export interface BankReconciliationRule {
  id: string;
  organizationId: string;
  ruleName: string;
  priority: number;
  narrationPattern: string;
  direction: 'CREDIT' | 'DEBIT' | 'BOTH';
  suggestedCategory?: string;
  suggestedAccountId?: string;
  isEnabled: boolean;
  createdAt: string;
}

export interface BankReconciliationSession {
  id: string;
  organizationId: string;
  bankAccountId: string;
  statementEndDate: string;
  statementClosingBalance: number;
  ledgerBalance: number;
  difference: number;
  reconciledBy?: string;
  reconciledAt: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'REOPENED';
}

export interface CSVColumnMapping {
  dateColumn: string;
  valueDateColumn?: string;
  narrationColumn: string;
  referenceColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  amountColumn?: string; // Single column with +/- or DR/CR
  balanceColumn?: string;
  chequeNumberColumn?: string;
  dateFormat?: string; // YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
}

export interface ParsedTransactionLine {
  transactionDate: string;
  valueDate?: string;
  amount: number;
  direction: BankTransactionDirection;
  runningBalance?: number;
  narration: string;
  reference?: string;
  transactionType?: string;
  utr?: string;
  rrn?: string;
  upiReference?: string;
  chequeNumber?: string;
  counterpartyName?: string;
  fingerprint?: string;
  rawData?: Record<string, any>;
}

export interface ParsedStatementResult {
  openingBalance: number;
  closingBalance: number;
  statementFrom?: string;
  statementTo?: string;
  currency: string;
  transactions: ParsedTransactionLine[];
  discrepancy?: number;
  detectedBankName?: string;
  detectedAccountNumber?: string;
  statementHealthWarning?: string;
}

export type BankStatementSourceFormat = 'CSV' | 'XLSX' | 'XLS' | 'OFX' | 'MT940' | 'CAMT053';

export interface BankStatementImportObservation {
  id: string;
  organizationId: string;
  statementImportId: string;
  statementTransactionId: string;
  rowNumber: number;
  rawData?: Record<string, any>;
  createdAt: string;
}

export interface BankingAccountOverviewItem {
  id: string;
  organizationId: string;
  ledgerAccountId?: string;
  accountName: string;
  accountNumber: string;
  maskedAccountNumber: string;
  bankName: string;
  accountType: string;
  currency: string;
  currentBalance: number;
  bookBalance: number | null;
  statementBalance: number | null;
  difference: number | null;
  toReviewCount: number;
  lastStatementDate: string | null;
  status: 'RECONCILED' | 'NEEDS_REVIEW' | 'STATEMENT_NEEDED' | 'NO_STATEMENT';
  hasStatement: boolean;
  reconciledThroughDate?: string | null;
  isActive: boolean;
  isArchived: boolean;
}

export interface BankingHealthSummary {
  totalToReview: number;
  totalPossibleDuplicates: number;
  staleStatementAccountsCount: number;
  reconciliationDifferenceAccountsCount: number;
}

export interface BankingOverviewResponse {
  accounts: BankingAccountOverviewItem[];
  health: BankingHealthSummary;
}

export interface StatementImportPreviewResponse {
  fileHash: string;
  filename: string;
  sourceFormat: string;
  detectedBankName?: string;
  detectedAccountNumber?: string;
  currency: string;
  statementFrom?: string;
  statementTo?: string;
  openingBalance: number;
  closingBalance: number;
  totalRows: number;
  exactDuplicatesCount: number;
  newRowsCount: number;
  possibleDuplicatesCount: number;
  statementHealthWarning?: string | null;
  discrepancy: number;
  previewRows: Array<{
    date: string;
    narration: string;
    reference?: string;
    moneyIn?: number;
    moneyOut?: number;
    runningBalance?: number;
    status: 'NEW' | 'EXACT_DUPLICATE' | 'POSSIBLE_DUPLICATE';
    ruleMatch?: string;
  }>;
}

export interface BankWorkspaceResponse {
  accountProfile: BankAccount;
  balances: {
    bookBalance: number | null;
    statementBalance: number | null;
    difference: number | null;
    reconciledThroughDate: string | null;
    lastStatementDate: string | null;
  };
  latestImport: {
    id: string;
    originalFilename: string;
    importedAt: string;
    statementFrom?: string;
    statementTo?: string;
    transactionCount: number;
  } | null;
  statusCounts: {
    all: number;
    toReview: number;
    recognized: number;
    matched: number;
    categorized: number;
    possibleDuplicates: number;
    reconciled: number;
  };
  reconciliationState: {
    isBalanced: boolean;
    unmatchedCount: number;
    difference: number;
  };
  transactions: Array<BankStatementTransaction & {
    moneyIn?: number;
    moneyOut?: number;
    matchDetails?: any;
    ruleMatchName?: string;
  }>;
  totalTransactions: number;
  discrepancyWarnings?: string[];
}
