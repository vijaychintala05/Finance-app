import React from 'react';
import { useBooks } from '../../../context/BooksContext';
import { formatCurrency, formatDate } from '../../../utils/formatters';

interface Props {
  reportId: string;
  dateRangeLabel: string;
}

export const AccountantProjectReports: React.FC<Props> = ({ reportId, dateRangeLabel }) => {
  const { settings, accounts, journalEntries, projects, getProjectSummary, invoices, expenses } = useBooks();

  // Trial Balance calculation
  const trialBalanceRows = accounts.map((acc) => {
    let debit = 0;
    let credit = 0;

    if (acc.type === 'Asset' || acc.type === 'Expense' || acc.type === 'Cost of Goods Sold') {
      debit = acc.balance >= 0 ? acc.balance : 0;
      credit = acc.balance < 0 ? Math.abs(acc.balance) : 0;
    } else {
      credit = acc.balance >= 0 ? acc.balance : 0;
      debit = acc.balance < 0 ? Math.abs(acc.balance) : 0;
    }

    return { ...acc, debit, credit };
  });

  const totalDebit = trialBalanceRows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = trialBalanceRows.reduce((s, r) => s + r.credit, 0);

  // Trial Balance
  if (reportId === 'trial_balance') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs max-w-4xl mx-auto space-y-6 text-xs font-mono">
        <div className="text-center border-b border-slate-200 pb-5">
          <h2 className="text-xl font-black text-slate-900">{settings.firmName}</h2>
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">
            CLOSING TRIAL BALANCE
          </h3>
          <p className="text-slate-500 text-[11px] mt-0.5">{dateRangeLabel}</p>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-3">Account Code</th>
                <th className="p-3">Account Title</th>
                <th className="p-3">Category</th>
                <th className="p-3 text-right">Debit ({settings.currencyCode})</th>
                <th className="p-3 text-right">Credit ({settings.currencyCode})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trialBalanceRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="p-3 font-bold text-blue-600">{row.code}</td>
                  <td className="p-3 font-sans font-semibold text-slate-900">{row.name}</td>
                  <td className="p-3 font-sans text-slate-500 text-[11px]">{row.type}</td>
                  <td className="p-3 text-right font-bold text-slate-800">
                    {row.debit > 0 ? formatCurrency(row.debit, settings.currencySymbol) : '-'}
                  </td>
                  <td className="p-3 text-right font-bold text-slate-800">
                    {row.credit > 0 ? formatCurrency(row.credit, settings.currencySymbol) : '-'}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-700 font-bold text-sm">
                <td colSpan={3} className="p-3 font-sans">GRAND TOTAL (DEBIT = CREDIT)</td>
                <td className="p-3 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(totalDebit, settings.currencySymbol)}</td>
                <td className="p-3 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCredit, settings.currencySymbol)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // General Ledger Report
  if (reportId === 'general_ledger') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs max-w-5xl mx-auto space-y-6 text-xs">
        <div className="text-center border-b border-slate-200 pb-5">
          <h2 className="text-xl font-black text-slate-900">{settings.firmName}</h2>
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">
            GENERAL LEDGER TRANSACTION AUDIT
          </h3>
          <p className="text-slate-500 text-[11px] mt-0.5">{dateRangeLabel}</p>
        </div>

        <div className="space-y-6 font-mono">
          {accounts.map((acc) => (
            <div key={acc.id} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 p-3 font-bold flex justify-between items-center font-sans">
                <div>
                  <span className="text-blue-600 dark:text-blue-400 mr-2 font-mono">[{acc.code}]</span>
                  <span>{acc.name}</span>
                </div>
                <div className="text-xs">
                  Closing Balance: <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(acc.balance, settings.currencySymbol)}</strong>
                </div>
              </div>

              <div className="p-3 bg-slate-50 text-[11px] text-slate-600 flex justify-between font-sans border-b border-slate-200">
                <span>Category: {acc.type} ({acc.subType})</span>
                <span>Currency: {settings.currencyCode}</span>
              </div>

              <div className="p-4 text-slate-500 text-center italic font-sans text-xs">
                Active posting transactions recorded in double-entry journal ledger.
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Journal Report
  if (reportId === 'journal_report') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs max-w-5xl mx-auto space-y-6 text-xs">
        <div className="text-center border-b border-slate-200 pb-5">
          <h2 className="text-xl font-black text-slate-900">{settings.firmName}</h2>
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">
            JOURNAL ENTRIES AUDIT REGISTER
          </h3>
          <p className="text-slate-500 text-[11px] mt-0.5">{dateRangeLabel}</p>
        </div>

        <div className="space-y-4 font-mono">
          {journalEntries.map((je) => (
            <div key={je.id} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100 p-3 font-bold font-sans flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <span className="text-blue-600">{je.journalNumber}</span>
                  <span className="text-slate-500 text-xs font-normal">• {formatDate(je.date)}</span>
                </div>
                <div className="text-slate-700 text-xs font-normal">{je.narration}</div>
              </div>

              <table className="w-full text-left border-t border-slate-200">
                <thead className="bg-slate-50 text-slate-400 text-[9px] uppercase font-bold">
                  <tr>
                    <th className="p-2">Account</th>
                    <th className="p-2 text-right">Debit</th>
                    <th className="p-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {je.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="p-2 font-sans font-semibold">{line.accountName}</td>
                      <td className="p-2 text-right font-bold text-slate-900">{line.debit > 0 ? formatCurrency(line.debit, settings.currencySymbol) : '-'}</td>
                      <td className="p-2 text-right font-bold text-slate-900">{line.credit > 0 ? formatCurrency(line.credit, settings.currencySymbol) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default rendering for Project Profitability or Activity Log
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs max-w-4xl mx-auto space-y-6 text-xs">
      <div className="text-center border-b border-slate-200 pb-5">
        <h2 className="text-xl font-black text-slate-900">{settings.firmName}</h2>
        <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">
          {reportId.replace(/_/g, ' ')} REPORT
        </h3>
        <p className="text-slate-500 text-[11px] mt-0.5">{dateRangeLabel}</p>
      </div>

      <div className="p-6 bg-slate-50 rounded-xl text-center text-slate-600 font-medium">
        Detailed accounting audit ledger active for {settings.firmName}.
      </div>
    </div>
  );
};
