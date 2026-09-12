import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Link2, Loader2, X, AlertCircle } from 'lucide-react';
import { BankingService } from '../../services/bankingService';
import { MatchSuggestion } from '../../types/banking';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface TransactionMatchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: any;
  bankAccountId?: string;
  currencySymbol: string;
  onMatchSuccess: () => void;
}

export const TransactionMatchDrawer: React.FC<TransactionMatchDrawerProps> = ({
  isOpen,
  onClose,
  transaction,
  currencySymbol,
  onMatchSuccess,
}) => {
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<MatchSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !transaction?.id) return;
    setIsLoading(true);
    setError(null);
    setSelectedSuggestion(null);

    BankingService.getTransactionSuggestions(transaction.id)
      .then((res) => {
        setSuggestions(res || []);
        if (res && res.length > 0) {
          setSelectedSuggestion(res[0]);
        }
      })
      .catch((err) => {
        console.warn('Could not load match suggestions:', err);
        setSuggestions([]);
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, transaction]);

  if (!isOpen || !transaction) return null;

  const txAmount = Number(transaction.amount || transaction.moneyIn || transaction.moneyOut || 0);
  const isDeposit = transaction.type === 'CREDIT' || transaction.type === 'DEPOSIT' || Boolean(transaction.moneyIn && !transaction.moneyOut);

  const handleConfirmMatch = async () => {
    if (!selectedSuggestion) {
      setError('Please select an accounting transaction to match against.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await BankingService.matchTransaction(
        transaction.id,
        selectedSuggestion.accountingTransactionType,
        selectedSuggestion.accountingTransactionId,
        selectedSuggestion.matchedAmount || txAmount
      );
      onMatchSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to link transaction.');
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
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Match Statement Row</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Link this bank feed to an existing invoice, bill, or journal</p>
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
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-blue-50/40 dark:bg-blue-950/20">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-300">
            Statement Line Details
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
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {isDeposit ? 'Deposit (CR)' : 'Withdrawal (DR)'}
              </span>
            </div>
          </div>
        </div>

        {/* Content Body: Suggested Matches */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Suggested Matches ({suggestions.length})
            </h3>
            <span className="text-[11px] text-slate-400">Select one to link</span>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center space-x-2 text-rose-700 dark:text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="py-12 text-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              <p className="text-xs font-medium">Scanning open invoices, bills, and journals...</p>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
              <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">No Automated Matches Found</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                No matching invoice or bill of {formatCurrency(txAmount, currencySymbol)} was found. You can categorize this statement line instead.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((sug) => {
                const isSelected =
                  selectedSuggestion?.accountingTransactionId === sug.accountingTransactionId &&
                  selectedSuggestion?.accountingTransactionType === sug.accountingTransactionType;

                return (
                  <div
                    key={`${sug.accountingTransactionType}-${sug.accountingTransactionId}`}
                    onClick={() => setSelectedSuggestion(sug)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start space-x-3">
                        <div
                          className={`w-5 h-5 rounded-full border mt-0.5 flex items-center justify-center ${
                            isSelected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {sug.accountingTransactionType}
                            </span>
                            <span className="text-xs font-mono text-blue-600 dark:text-blue-400 font-semibold">
                              #{sug.details.referenceNumber || sug.accountingTransactionId.slice(0, 8)}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              {sug.confidenceScore}% match
                            </span>
                          </div>
                          {sug.details.entityName && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-0.5">
                              {sug.details.entityName}
                            </p>
                          )}
                          {sug.details.date && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Date: {formatDate(sug.details.date)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                          {formatCurrency(sug.matchedAmount || sug.details.totalAmount || txAmount, currencySymbol)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
            disabled={!selectedSuggestion || isSubmitting}
            onClick={handleConfirmMatch}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Matching...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Match</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
