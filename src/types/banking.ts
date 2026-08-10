export type BankStatementSourceFormat = 'CSV' | 'XLSX' | 'OFX' | 'MT940' | 'CAMT053';

export type BankTransactionDirection = 'CREDIT' | 'DEBIT';

export type BankReconciliationStatus =
  | 'UNMATCHED'
  | 'SUGGESTED'
  | 'PARTIALLY_MATCHED'
  | 'MATCHED'
  | 'RECONCILED'
  | 'IGNORED'
  | 'NEEDS_REVIEW';

export type AccountingTransactionType =
  | 'invoice'
  | 'payment_received'
  | 'bill'
  | 'payment_made'
  | 'expense'
  | 'transfer'
  | 'journal';

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
  discrepancy?: number; // non-zero if Opening + Credits - Debits !== Closing
}
