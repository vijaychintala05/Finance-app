import React, { useState } from 'react';
import { Calculator, Plus, Search } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { JournalModal } from './JournalModal';

export const JournalEntriesView: React.FC = () => {
  const { journalEntries, settings } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredJournals = journalEntries.filter(
    (j) =>
      j.entryNumber.toLowerCase().includes(search.toLowerCase()) ||
      j.description.toLowerCase().includes(search.toLowerCase()) ||
      j.reference.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
            <Calculator className="w-6 h-6 text-blue-600" />
            <span>Double-Entry Journal Vouchers</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            General ledger journal entries with strictly enforced balanced debit and credit lines
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Journal Entry</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search voucher #, reference, narrative..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-9 pr-3 py-2 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Entries List */}
      <div className="space-y-4">
        {filteredJournals.map((jrn) => {
          const totalDebit = jrn.lines.reduce((s, l) => s + (l.debit || 0), 0);
          return (
            <div
              key={jrn.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3"
            >
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center space-x-3">
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    {jrn.entryNumber}
                  </span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {jrn.reference}
                  </span>
                  <span className="text-xs text-slate-500">• {formatDate(jrn.date)}</span>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded border border-emerald-500/20">
                    {jrn.status}
                  </span>
                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                    {formatCurrency(totalDebit, settings.currencySymbol)}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400">{jrn.description}</p>

              {/* Lines table */}
              <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5 pl-3">Account Code</th>
                      <th className="p-2.5">Account Name</th>
                      <th className="p-2.5 text-right">Debit</th>
                      <th className="p-2.5 text-right pr-3">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {jrn.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="p-2.5 pl-3 font-mono text-blue-600 font-semibold">
                          {l.accountCode}
                        </td>
                        <td className="p-2.5 font-medium text-slate-800 dark:text-slate-200">
                          {l.accountName}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-800 dark:text-slate-200">
                          {l.debit > 0 ? formatCurrency(l.debit, settings.currencySymbol) : '-'}
                        </td>
                        <td className="p-2.5 text-right pr-3 font-mono text-slate-800 dark:text-slate-200">
                          {l.credit > 0 ? formatCurrency(l.credit, settings.currencySymbol) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      <JournalModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};
