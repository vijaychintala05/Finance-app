import React, { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, DollarSign, X } from 'lucide-react';
import { Account, FirmSettings } from '../../types';
import { useBooks } from '../../context/BooksContext';

interface RecordBankTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAccountId?: string;
  defaultType?: 'DEBIT' | 'CREDIT'; // DEBIT = Money In, CREDIT = Money Out
}

export const RecordBankTransactionModal: React.FC<RecordBankTransactionModalProps> = ({
  isOpen,
  onClose,
  defaultAccountId,
  defaultType = 'DEBIT',
}) => {
  const { accounts, addJournalEntry, settings } = useBooks();

  const [txType, setTxType] = useState<'DEBIT' | 'CREDIT'>(defaultType);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    defaultAccountId || accounts[0]?.id || ''
  );
  const [amount, setAmount] = useState<number | ''>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState<string>(
    `BANK-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [partyName, setPartyName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [oppositeCategory, setOppositeCategory] = useState<string>('');

  if (!isOpen) return null;

  // Treasury Accounts list
  const treasuryAccounts = accounts.filter(
    (a) =>
      a.subType === 'Bank' ||
      a.subType === 'Cash' ||
      a.subType === 'Cash & Bank' ||
      a.subType === 'Credit Cards' ||
      a.subType === 'Digital Wallet' ||
      a.subType === 'Loans' ||
      a.type === 'Asset'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0 || !selectedAccountId) return;

    const numAmount = Number(amount);
    const targetAccount = accounts.find((a) => a.id === selectedAccountId);
    if (!targetAccount) return;

    // Build opposing account line (e.g. Income or Expense account)
    // Find a general income or expense account
    const opposingAccount = accounts.find((a) =>
      txType === 'DEBIT'
        ? a.type === 'Revenue' || a.type === 'Income' || a.subType === 'Sales'
        : a.type === 'Expense' || a.subType === 'Office & Administrative'
    ) || accounts[0];

    // For Money In (DEBIT): Bank Account is Debited (+), Opposing Account is Credited (-)
    // For Money Out (CREDIT): Opposing Account is Debited (+), Bank Account is Credited (-)
    const lines =
      txType === 'DEBIT'
        ? [
            {
              accountId: targetAccount.id,
              accountCode: targetAccount.code,
              accountName: targetAccount.name,
              debit: numAmount,
              credit: 0,
              description: description || `Money In - ${partyName || 'Deposit'}`,
            },
            {
              accountId: opposingAccount.id,
              accountCode: opposingAccount.code,
              accountName: opposingAccount.name,
              debit: 0,
              credit: numAmount,
              description: description || `Income source - ${partyName || 'Deposit'}`,
            },
          ]
        : [
            {
              accountId: opposingAccount.id,
              accountCode: opposingAccount.code,
              accountName: opposingAccount.name,
              debit: numAmount,
              credit: 0,
              description: description || `Expense - ${partyName || 'Withdrawal'}`,
            },
            {
              accountId: targetAccount.id,
              accountCode: targetAccount.code,
              accountName: targetAccount.name,
              debit: 0,
              credit: numAmount,
              description: description || `Money Out - ${partyName || 'Withdrawal'}`,
            },
          ];

    addJournalEntry({
      date,
      reference,
      description: description || `${txType === 'DEBIT' ? 'Deposit' : 'Withdrawal'}: ${partyName || targetAccount.name}`,
      lines,
      status: 'Posted',
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Record Bank Transaction
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* DIRECTION SWITCH (Money In / Money Out) */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setTxType('DEBIT')}
              className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                txType === 'DEBIT'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Money In (Deposit)</span>
            </button>
            <button
              type="button"
              onClick={() => setTxType('CREDIT')}
              className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                txType === 'CREDIT'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Money Out (Expense)</span>
            </button>
          </div>

          {/* BANK ACCOUNT SELECTOR */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Select Bank / Treasury Account *
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              required
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {treasuryAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.subType}) — {settings.currencySymbol}
                  {acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
          </div>

          {/* AMOUNT & DATE */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Amount ({settings.currencySymbol}) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* REFERENCE & PARTY NAME */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Reference / Check #
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Ref number"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Payee / Customer Name
              </label>
              <input
                type="text"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                placeholder="Name of person / vendor"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* DESCRIPTION */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Description / Notes
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed transaction particulars..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* FOOTER ACTIONS */}
          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-colors cursor-pointer ${
                txType === 'DEBIT' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
              }`}
            >
              Record {txType === 'DEBIT' ? 'Money In' : 'Money Out'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
