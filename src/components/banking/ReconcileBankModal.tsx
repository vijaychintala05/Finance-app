import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, DollarSign, X } from 'lucide-react';
import { Account, FirmSettings } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface ReconcileBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
  settings: FirmSettings;
  onReconcileComplete?: () => void;
}

export const ReconcileBankModal: React.FC<ReconcileBankModalProps> = ({
  isOpen,
  onClose,
  account,
  settings,
  onReconcileComplete,
}) => {
  const [statementDate, setStatementDate] = useState<string>('2026-07-31');
  const [statementEndingBalance, setStatementEndingBalance] = useState<number>(
    account ? account.balance - 500 : 0
  );
  const [clearedTxIds, setClearedTxIds] = useState<Set<string>>(
    new Set(['tx-1', 'tx-2', 'tx-3'])
  );
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  if (!isOpen || !account) return null;

  const glBalance = account.balance;
  const unreconciledDiff = Math.abs(glBalance - statementEndingBalance);

  const mockTxList = [
    { id: 'tx-1', date: '2026-07-28', ref: 'DEP-8841', desc: 'Client Payment - AcroTech', amount: 15400, type: 'IN' },
    { id: 'tx-2', date: '2026-07-25', ref: 'CHK-1092', desc: 'Office Lease Rent', amount: -4500, type: 'OUT' },
    { id: 'tx-3', date: '2026-07-20', ref: 'ACH-4910', desc: 'AWS Cloud Services', amount: -1280, type: 'OUT' },
    { id: 'tx-4', date: '2026-07-15', ref: 'DEP-9012', desc: 'Retainer Deposit - Zenith', amount: 8000, type: 'IN' },
    { id: 'tx-5', date: '2026-07-10', ref: 'POS-3391', desc: 'SaaS Software Subscriptions', amount: -500, type: 'OUT' },
  ];

  const toggleCheck = (id: string) => {
    setClearedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFinishReconcile = () => {
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      if (onReconcileComplete) onReconcileComplete();
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                Reconcile Bank Account
              </h3>
              <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-full">
                {account.name} (#{account.code})
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Match statement ending balance with General Ledger transactions
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-6 space-y-5">
          {/* RECONCILIATION SUMMARY KPI STRIP */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">GL Balance</span>
              <span className="text-base font-black font-mono text-slate-900 dark:text-slate-100 mt-0.5 block">
                {formatCurrency(glBalance, settings.currencySymbol)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">Statement Balance</span>
              <span className="text-base font-black font-mono text-blue-600 dark:text-blue-400 mt-0.5 block">
                {formatCurrency(statementEndingBalance, settings.currencySymbol)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">Difference</span>
              <span className={`text-base font-black font-mono mt-0.5 block ${unreconciledDiff === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {formatCurrency(unreconciledDiff, settings.currencySymbol)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Reconciled Through</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-1 block">
                {statementDate}
              </span>
            </div>
          </div>

          {/* INPUT FORM */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Statement Ending Date
              </label>
              <input
                type="date"
                value={statementDate}
                onChange={(e) => setStatementDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Statement Ending Balance ({settings.currencySymbol})
              </label>
              <input
                type="number"
                step="0.01"
                value={statementEndingBalance}
                onChange={(e) => setStatementEndingBalance(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* CHECKLIST TABLE */}
          <div>
            <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
              Select Cleared Statement Transactions
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-2.5 text-center">Clear</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Ref</th>
                    <th className="p-2.5">Description</th>
                    <th className="p-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {mockTxList.map((tx) => {
                    const isChecked = clearedTxIds.has(tx.id);
                    return (
                      <tr
                        key={tx.id}
                        onClick={() => toggleCheck(tx.id)}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer ${
                          isChecked ? 'bg-blue-50/50 dark:bg-blue-950/30' : ''
                        }`}
                      >
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="p-2.5 font-semibold text-slate-700 dark:text-slate-300">{tx.date}</td>
                        <td className="p-2.5 font-mono text-blue-600">{tx.ref}</td>
                        <td className="p-2.5 font-medium text-slate-900 dark:text-slate-100">{tx.desc}</td>
                        <td className={`p-2.5 text-right font-mono font-bold ${tx.amount >= 0 ? 'text-emerald-600' : 'text-slate-900 dark:text-slate-100'}`}>
                          {formatCurrency(tx.amount, settings.currencySymbol)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {clearedTxIds.size} of {mockTxList.length} transactions cleared
          </span>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleFinishReconcile}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-xs cursor-pointer transition-colors"
            >
              {isSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>Reconciled!</span>
                </>
              ) : (
                <>
                  <span>Complete Reconciliation</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
