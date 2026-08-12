import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { JournalLine } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { QuickAddProjectModal } from '../common/QuickAddProjectModal';

interface JournalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JournalModal: React.FC<JournalModalProps> = ({ isOpen, onClose }) => {
  const { accounts, projects, addJournalEntry } = useBooks();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isQuickProjectOpen, setIsQuickProjectOpen] = useState(false);

  const [lines, setLines] = useState<JournalLine[]>([
    {
      id: 'jl-1',
      accountId: accounts[0]?.id || 'acc-1000',
      accountCode: accounts[0]?.code || '1000',
      accountName: accounts[0]?.name || 'Operating Bank',
      debit: 1000,
      credit: 0,
    },
    {
      id: 'jl-2',
      accountId: accounts[accounts.length - 1]?.id || 'acc-3000',
      accountCode: accounts[accounts.length - 1]?.code || '3000',
      accountName: accounts[accounts.length - 1]?.name || "Owner's Capital",
      debit: 0,
      credit: 1000,
    },
  ]);

  if (!isOpen) return null;

  const handleAccountSelect = (lineIdx: number, accId: string) => {
    const acc = accounts.find((a) => a.id === accId);
    if (!acc) return;
    setLines((prev) =>
      prev.map((l, idx) =>
        idx === lineIdx
          ? {
              ...l,
              accountId: acc.id,
              accountCode: acc.code,
              accountName: acc.name,
            }
          : l
      )
    );
  };

  const handleLineValueChange = (lineIdx: number, field: 'debit' | 'credit', value: number) => {
    setLines((prev) =>
      prev.map((l, idx) => (idx === lineIdx ? { ...l, [field]: value } : l))
    );
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: `jl-${Date.now()}-${prev.length + 1}`,
        accountId: accounts[0]?.id || 'acc-1000',
        accountCode: accounts[0]?.code || '1000',
        accountName: accounts[0]?.name || 'Operating Bank',
        debit: 0,
        credit: 0,
      },
    ]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!isBalanced) {
      setErrorMsg(
        `Debits ($${totalDebit}) must equal Credits ($${totalCredit}). Difference: $${Math.abs(
          totalDebit - totalCredit
        )}`
      );
      return;
    }

    try {
    const success = await addJournalEntry({
      date,
      reference: reference || 'Manual Double-Entry',
      description,
      projectId: projectId || undefined,
      lines,
      status: 'Posted',
    });

    if (success) {
      onClose();
    } else {
      setErrorMsg('Failed to post journal entry.');
    }
    } catch (error: any) {
      setErrorMsg(error.message || 'Failed to post journal entry.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
            Post Manual Double-Entry Journal
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {errorMsg && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 p-3 rounded-lg font-medium">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Entry Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Reference / Voucher #
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. Capital Infusion"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-slate-600 dark:text-slate-300 font-medium">
                  Tag Project (Optional)
                </label>
                <button
                  type="button"
                  onClick={() => setIsQuickProjectOpen(true)}
                  className="text-blue-600 dark:text-blue-400 font-bold hover:underline text-[11px] flex items-center space-x-0.5 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Project</span>
                </button>
              </div>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              >
                <option value="">-- No Project --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
              General Narrative / Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Reason for double-entry adjustment..."
              required
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
            />
          </div>

          {/* Journal Lines Table */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="block font-bold text-slate-800 dark:text-slate-200">
                Journal Lines (Debits = Credits)
              </label>
              <button
                type="button"
                onClick={addLine}
                className="text-blue-600 font-semibold flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Row</span>
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Account (COA)</th>
                    <th className="p-2.5 w-28">Debit ($)</th>
                    <th className="p-2.5 w-28">Credit ($)</th>
                    <th className="p-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lines.map((l, idx) => (
                    <tr key={l.id}>
                      <td className="p-2">
                        <select
                          value={l.accountId}
                          onChange={(e) => handleAccountSelect(idx, e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs text-slate-800 dark:text-slate-200"
                        >
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              [{acc.code}] {acc.name} ({acc.type})
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          value={l.debit}
                          onChange={(e) =>
                            handleLineValueChange(idx, 'debit', Number(e.target.value))
                          }
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs text-slate-800 dark:text-slate-200 font-bold"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          value={l.credit}
                          onChange={(e) =>
                            handleLineValueChange(idx, 'credit', Number(e.target.value))
                          }
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs text-slate-800 dark:text-slate-200 font-bold"
                        />
                      </td>

                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="text-slate-400 hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Balance Indicator Footer */}
          <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="space-x-4 font-mono font-bold">
              <span>Total Debit: ${totalDebit}</span>
              <span>Total Credit: ${totalCredit}</span>
            </div>
            <span
              className={`text-xs font-bold px-2 py-1 rounded ${
                isBalanced
                  ? 'bg-emerald-500/20 text-emerald-600'
                  : 'bg-rose-500/20 text-rose-600'
              }`}
            >
              {isBalanced ? '✓ Balanced Entry' : '✗ Out of Balance'}
            </span>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isBalanced}
              className={`px-5 py-2 rounded-lg font-semibold shadow-sm cursor-pointer ${
                isBalanced
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              Post Journal Entry
            </button>
          </div>
        </form>
      </div>

      <QuickAddProjectModal
        isOpen={isQuickProjectOpen}
        onClose={() => setIsQuickProjectOpen(false)}
        onProjectCreated={(newPrj) => {
          setProjectId(newPrj.id);
        }}
      />
    </div>
  );
};
