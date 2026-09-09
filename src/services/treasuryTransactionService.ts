import { apiClient } from '../api/client';

export type TreasuryTransactionType =
  | 'PAYROLL_PAYMENT' | 'EMPLOYEE_REIMBURSEMENT' | 'OWNER_CONTRIBUTION'
  | 'OWNER_WITHDRAWAL' | 'LOAN_RECEIVED' | 'LOAN_REPAYMENT' | 'TAX_PAYMENT';

export interface TreasuryTransactionInput {
  transactionType: TreasuryTransactionType;
  transactionDate: string;
  monetaryAccountId: string;
  counterAccountId: string;
  amount: number;
  principalAmount?: number;
  interestAmount?: number;
  interestExpenseAccountId?: string;
  reference?: string;
  description?: string;
  employeeName?: string;
}

export interface TreasuryTransactionRow {
  id: string;
  transaction_number: string;
  transaction_type: TreasuryTransactionType;
  transaction_date: string;
  amount: number;
  status: 'POSTED' | 'REVERSED';
  reference?: string;
  description?: string;
}

export class TreasuryTransactionService {
  static async list(): Promise<TreasuryTransactionRow[]> {
    const response = await apiClient.get<TreasuryTransactionRow[]>('/finance/treasury-transactions');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  static async create(input: TreasuryTransactionInput): Promise<{ id: string; transactionNumber: string; journalEntryId: string }> {
    const response = await apiClient.post<{ id: string; transactionNumber: string; journalEntryId: string }>('/finance/treasury-transactions', input);
    if (response.error || !response.data) throw new Error(response.error || 'Treasury transaction was not posted.');
    return response.data;
  }

  static async reverse(id: string, reason: string): Promise<{ id: string; reversalJournalEntryId: string }> {
    const response = await apiClient.post<{ id: string; reversalJournalEntryId: string }>(`/finance/treasury-transactions/${encodeURIComponent(id)}/reverse`, { reason });
    if (response.error || !response.data) throw new Error(response.error || 'Treasury transaction was not reversed.');
    return response.data;
  }
}
