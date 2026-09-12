import React, { useMemo, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, FileCheck2, Loader2, Tag, X } from 'lucide-react';
import { Account } from '../../types';
import { BankAccount } from '../../types/banking';
import { BankingService } from '../../services/bankingService';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface TransactionCategorizeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: any;
  bankAccount: BankAccount | null;
  accounts: Account[];
  currencySymbol: string;
  onCategorizeSuccess: () => void;
}

export const TransactionCategorizeDrawer: React.FC<TransactionCategorizeDrawerProps> = ({
  isOpen,
  onClose,
  transaction,
  bankAccount,
  accounts,
  currencySymbol,
  onCategorizeSuccess,
}) => {
  const isDeposit =
    transaction?.type === 'CREDIT' ||
    transaction?.type === 'DEPOSIT' ||
    Boolean(transaction?.moneyIn && !transaction?.moneyOut);

  // Eligible accounts for categorization:
  // If withdrawal: Expense accounts or other asset/liability accounts
  // If deposit: Income accounts or client receivable
  const eligibleAccounts = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.status !== 'Inactive' &&
        !a.isLocked &&
        a.id !== bankAccount?.ledgerAccountId &&
        (isDeposit
          ? a.type === 'Revenue' || a.type === 'Income' || a.type === 'Asset' || a.type === 'Liability'
          : a.type === 'Expense' || a.type === 'Asset' || a.type === 'Liability' || a.type === 'Equity')
    );
  }, [accounts, bankAccount, isDeposit]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [counterpartyName, setCounterpartyName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [createRule, setCreateRule] = useState<boolean>(false);
  const [ruleName, setRuleName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen || !transaction) return;
    setError(null);
    setCounterpartyName(transaction.counterpartyName || transaction.partyName || '');
    setNotes(transaction.description || transaction.narration || '');
    setCreateRule(false);
    setRuleName(transaction.description ? `Rule for ${transaction.description.slice(0, 24)}` : '');

    // Pre-select suggested account if available, otherwise default to first eligible category
    const suggested = transaction.suggestedAccountId
      ? eligibleAccounts.find((a) => a.id === transaction.suggestedAccountId)
      : null;
    const defaultAcc = suggested || eligibleAccounts[0];
    setSelectedAccountId(defaultAcc ? defaultAcc.id : '');
  }, [isOpen, transaction, eligibleAccounts]);

  if (!isOpen || !transaction) return null;

  const txAmount = Math.abs(Number(transaction.amount || transaction.moneyIn || transaction.moneyOut || 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) {
      setError('Please select an accounting category / account.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await BankingService.categorizeTransaction(transaction.id, {
        ledgerAccountId: selectedAccountId,
        counterpartyName: counterpartyName.trim() || undefined,
        notes: notes.trim() || undefined,
        createRule,
        ruleName: createRule ? ruleName.trim() || 'Categorization Rule' : undefined,
      });
      onCategorizeSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to categorize transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex justify-end animate-fade-in">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Categorize Statement Row</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Post a balanced general ledger transaction from bank evidence</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Statement Row Summary Card */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-purple-50/40 dark:bg-purple-950/20">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700 dark:text-purple-300">
            Statement Row
          </span>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {transaction.description || transaction.narration || 'Bank Transaction'}
              </p>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{formatDate(transaction.date || transaction.transactionDate)}</span>
                {transaction.ref || transaction.referenceNumber ? (
                  <>
                    <span>•</span>
                    <span className="font-mono">{transaction.ref || transaction.referenceNumber}</span>
                  </>
                ) : null}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div
                className={`text-base font-black font-mono ${
                  isDeposit ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {isDeposit ? '+' : '-'}{formatCurrency(txAmount, currencySymbol)}
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isDeposit
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                }`}
              >
                {isDeposit ? 'Deposit (CR)' : 'Withdrawal (DR)'}
              </span>
            </div>
          </div>
        </div>

        {/* Categorization Form */}
        <form onSubmit={handleSubmit} className="flex-1 p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center space-x-2 text-rose-700 dark:text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Account Category Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Category / Expense Account <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
            >
              <option value="" disabled>Select an account...</option>
              {eligibleAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.code || acc.type})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              {isDeposit
                ? 'Credited to Bank Account, Debited/Credited from selected revenue or asset account'
                : 'Debited from selected expense account, Credited to Bank Account'}
            </p>
          </div>

          {/* Counterparty / Payee Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Payee / Counterparty
            </label>
            <input
              type="text"
              placeholder="e.g. AWS Cloud, Office Landlord, Acme Corp"
              value={counterpartyName}
              onChange={(e) => setCounterpartyName(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-purple-600"
            />
          </div>

          {/* Description / Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Notes / Description
            </label>
            <textarea
              rows={3}
              placeholder="Add explanation for this transaction..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-purple-600"
            />
          </div>

          {/* Rule Automation Option */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={createRule}
                onChange={(e) => setCreateRule(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Remember this rule for similar statement rows
              </span>
            </label>

            {createRule && (
              <div className="mt-3 pl-6">
                <input
                  type="text"
                  placeholder="Rule Name"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-purple-600"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Future statements matching narration will suggest this category automatically.
                </p>
              </div>
            )}
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedAccountId || isSubmitting}
            onClick={handleSubmit}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Categorizing...</span>
              </>
            ) : (
              <>
                <FileCheck2 className="w-4 h-4" />
                <span>Categorize Transaction</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
