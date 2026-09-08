import React, { useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { Account } from '../../types';
import { BankAccount } from '../../types/banking';
import { formatCurrency } from '../../utils/formatters';
import { useBooks } from '../../context/BooksContext';

interface DeleteBankAccountModalProps {
  isOpen: boolean;
  account: Account | null;
  bankAccount: BankAccount | null;
  currencySymbol: string;
  onClose: () => void;
  onDeleted: () => void;
}

export const DeleteBankAccountModal: React.FC<DeleteBankAccountModalProps> = ({
  isOpen,
  account,
  bankAccount,
  currencySymbol,
  onClose,
  onDeleted,
}) => {
  const { deleteBankAccount } = useBooks();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !account) return null;

  const hasNonZeroBalance = Math.abs(account.balance || 0) > 0.0001;

  const handleDelete = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      // Use the bankAccount ID if available, otherwise ledger account ID
      const targetId = bankAccount?.id || account.id;
      await deleteBankAccount(targetId);
      onDeleted();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Bank account could not be deleted');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Delete Bank Account</h3>
              <p className="text-xs text-slate-400 font-medium">Permanent removal of bank profile</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Account Detail Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-slate-900 dark:text-white">{account.name}</span>
              <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">#{account.code}</span>
            </div>
            {bankAccount && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {bankAccount.bankName} • {bankAccount.maskedAccountNumber || bankAccount.accountNumber}
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Current Balance</span>
              <span
                className={`font-mono font-extrabold ${
                  hasNonZeroBalance ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {formatCurrency(account.balance, currencySymbol)}
              </span>
            </div>
          </div>

          {/* Non-zero balance warning */}
          {hasNonZeroBalance ? (
            <div className="flex items-start space-x-3 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Account has a non-zero balance</strong>
                <span>
                  Bank accounts with remaining funds or overdraft balances cannot be deleted. Please adjust or transfer
                  the balance to zero first.
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Are you sure you want to delete this bank account? This action will permanently remove the account profile
              and its linked ledger record. Accounts with existing transaction history or statement imports cannot be
              deleted and must be archived instead.
            </p>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-start space-x-2.5 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <div className="flex-1 font-semibold">{error}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 bg-slate-50/80 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || hasNonZeroBalance}
            className="px-4 py-2 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:pointer-events-none rounded-xl flex items-center space-x-2 shadow-2xs cursor-pointer transition-colors"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Delete Account</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
