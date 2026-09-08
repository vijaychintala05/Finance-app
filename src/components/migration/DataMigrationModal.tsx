import React, { useState, useMemo } from 'react';
import {
  Database,
  X,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Plus,
  Trash2,
  FileSpreadsheet,
  Users,
  Building,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useBooks } from '../../context/BooksContext';

interface OpeningBalanceLineInput {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
}

interface DataMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const DataMigrationModal: React.FC<DataMigrationModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [activeTab, setActiveTab] = useState<'BALANCES' | 'MASTER_DATA'>('BALANCES');

  // Opening Balance state
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [autoBalanceWithEquity, setAutoBalanceWithEquity] = useState<boolean>(true);
  const [lines, setLines] = useState<OpeningBalanceLineInput[]>([
    { accountId: '', accountCode: '1010', accountName: 'Checking Account', debit: 15000, credit: 0 },
    { accountId: '', accountCode: '1200', accountName: 'Accounts Receivable', debit: 4500, credit: 0 },
    { accountId: '', accountCode: '2000', accountName: 'Accounts Payable', debit: 0, credit: 3200 },
  ]);

  // Master Data state
  const [masterDataType, setMasterDataType] = useState<'CUSTOMERS' | 'VENDORS' | 'ACCOUNTS'>('CUSTOMERS');
  const [csvText, setCsvText] = useState<string>(
    'name,email,phone\nAcme Corp,billing@acmewidgets.example,555-0100\nStark Industries,finance@stark.example,555-0199'
  );

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<any | null>(null);

  const { accounts, refreshAll } = useBooks();
  const apiClient = useMemo(() => new ApiClient(), []);

  // Calculate live debits, credits, variance
  const totals = useMemo(() => {
    let debits = 0;
    let credits = 0;
    for (const line of lines) {
      debits += Number(line.debit || 0);
      credits += Number(line.credit || 0);
    }
    const variance = Math.round(Math.abs(debits - credits) * 100) / 100;
    const isBalanced = variance < 0.01;
    return {
      debits: Math.round(debits * 100) / 100,
      credits: Math.round(credits * 100) / 100,
      variance,
      isBalanced,
    };
  }, [lines]);

  if (!isOpen) return null;

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      { accountId: '', accountCode: '', accountName: '', debit: 0, credit: 0 },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: keyof OpeningBalanceLineInput, val: any) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };

      // Auto-populate name if code changed and exists in COA
      if (field === 'accountCode') {
        const found = accounts.find((a) => a.code === val);
        if (found) {
          copy[idx].accountName = found.name;
          copy[idx].accountId = found.id;
        }
      }
      return copy;
    });
  };

  const handlePreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post('/stage6/migration/opening-balances/preview', {
        lines: lines.map((l) => ({
          accountCode: l.accountCode,
          accountName: l.accountName,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
        })),
      });
      setPreviewResult(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate preview');
    } finally {
      setLoading(false);
    }
  };

  const handlePostBalances = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post('/stage6/migration/opening-balances', {
        asOfDate,
        lines: lines.map((l) => ({
          accountCode: l.accountCode,
          accountName: l.accountName,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
        })),
        autoBalanceWithEquity,
      });

      if (res.data) {
        setSuccessMessage(
          `Successfully posted opening balances! Entry #${(res.data as any).entryNumber} created with ${(res.data as any).linesPosted} lines.`
        );
        refreshAll?.();
        onSuccess?.();
      }
    } catch (err: any) {
      setError(err.message || 'Opening balances could not be posted.');
    } finally {
      setLoading(false);
    }
  };

  const handleImportMasterData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Parse CSV into array of objects
      const rawRows = csvText.split('\n').map((r) => r.trim()).filter(Boolean);
      if (rawRows.length < 2) {
        throw new Error('Please provide at least a header row and 1 data row.');
      }
      const headers = rawRows[0].split(',').map((h) => h.trim());
      const records = rawRows.slice(1).map((row) => {
        const cols = row.split(',').map((c) => c.trim());
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => {
          obj[h] = cols[idx] || '';
        });
        return obj;
      });

      const res = await apiClient.post<{ imported: number; skipped: number; errors: any[] }>(
        '/stage6/migration/master-data',
        {
          type: masterDataType,
          records,
        }
      );

      if (res.data) {
        setSuccessMessage(
          `Master Data imported: ${res.data.imported} records created, ${res.data.skipped} duplicates skipped.`
        );
        refreshAll?.();
        onSuccess?.();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to import master data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Data Migration & Opening Balances Tooling
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Safely onboard legacy accounting data with double-entry balance validation and master data imports.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-6 pt-3 border-b border-gray-200 dark:border-gray-700 flex gap-4">
          <button
            onClick={() => setActiveTab('BALANCES')}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'BALANCES'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <Scale className="w-4 h-4" />
            Opening Balances Reconciliation
          </button>
          <button
            onClick={() => setActiveTab('MASTER_DATA')}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'MASTER_DATA'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Master Data CSV Import
          </button>
        </div>

        {/* Feedback Alerts */}
        <div className="px-6 pt-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-lg text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'BALANCES' ? (
            <div className="space-y-5">
              {/* As-of Date & Auto Balance Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-700/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Conversion / As-of Date
                  </label>
                  <input
                    type="date"
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-400 mt-1">Transactions before this date will be summarized in this entry.</p>
                </div>

                <div className="flex flex-col justify-center">
                  <label className="flex items-center gap-2 cursor-pointer mt-3">
                    <input
                      type="checkbox"
                      checked={autoBalanceWithEquity}
                      onChange={(e) => setAutoBalanceWithEquity(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      Auto-balance variance into Opening Balance Equity
                    </span>
                  </label>
                  <p className="text-xs text-gray-400 mt-1">
                    Ensures double-entry equality (Debits = Credits) by absorbing differences into Equity account 3999.
                  </p>
                </div>
              </div>

              {/* Lines Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Opening Balances by Account</h3>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Account Line
                  </button>
                </div>

                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 uppercase font-semibold border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="py-2.5 px-3">Account Code</th>
                        <th className="py-2.5 px-3">Account Name</th>
                        <th className="py-2.5 px-3 text-right">Debit ($)</th>
                        <th className="py-2.5 px-3 text-right">Credit ($)</th>
                        <th className="py-2.5 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                      {lines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="e.g. 1010"
                              value={line.accountCode}
                              onChange={(e) => handleLineChange(idx, 'accountCode', e.target.value)}
                              className="w-24 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs bg-transparent"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="Account description"
                              value={line.accountName}
                              onChange={(e) => handleLineChange(idx, 'accountName', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs bg-transparent"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={line.debit || ''}
                              onChange={(e) => handleLineChange(idx, 'debit', parseFloat(e.target.value) || 0)}
                              className="w-28 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs text-right bg-transparent"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={line.credit || ''}
                              onChange={(e) => handleLineChange(idx, 'credit', parseFloat(e.target.value) || 0)}
                              className="w-28 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs text-right bg-transparent"
                            />
                          </td>
                          <td className="p-2 text-center">
                            {lines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(idx)}
                                className="text-gray-400 hover:text-rose-600 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Ledger Equilibrium Summary Card */}
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Total Debits</div>
                      <div className="text-base font-bold text-gray-900 dark:text-white">${totals.debits.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Total Credits</div>
                      <div className="text-base font-bold text-gray-900 dark:text-white">${totals.credits.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Variance</div>
                      <div className={`text-base font-bold ${totals.isBalanced ? 'text-emerald-600' : 'text-amber-600'}`}>
                        ${totals.variance.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div>
                    {totals.isBalanced ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <CheckCircle2 className="w-4 h-4" /> In Perfect Equilibrium
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        <Scale className="w-4 h-4" /> Out of Balance by ${totals.variance.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-3">
                {(['CUSTOMERS', 'VENDORS', 'ACCOUNTS'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setMasterDataType(type);
                      if (type === 'CUSTOMERS') {
                        setCsvText('name,email,phone\nAcme Corp,billing@acmewidgets.example,555-0100\nStark Industries,finance@stark.example,555-0199');
                      } else if (type === 'VENDORS') {
                        setCsvText('name,companyName,email\nPaper Supplies Depot,PaperCo,orders@paperco.example\nAWS Cloud,Amazon Web Services,billing@aws.example');
                      } else {
                        setCsvText('code,name,type\n1020,Savings Account,Asset\n5010,Marketing Expense,Expense');
                      }
                    }}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors ${
                      masterDataType === type
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {type === 'CUSTOMERS' && <Users className="w-4 h-4" />}
                    {type === 'VENDORS' && <Building className="w-4 h-4" />}
                    {type === 'ACCOUNTS' && <BookOpen className="w-4 h-4" />}
                    Import {type === 'CUSTOMERS' ? 'Customers' : type === 'VENDORS' ? 'Vendors' : 'Accounts'}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Paste CSV Records (Comma-delimited with header row)
                </label>
                <textarea
                  rows={8}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  className="w-full font-mono text-xs p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Deduplication is automatic: records matching existing names or account codes will be skipped without error.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-3">
            {activeTab === 'BALANCES' ? (
              <>
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={loading}
                  className="px-4 py-2 border border-indigo-200 dark:border-indigo-800 rounded-lg text-sm font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                >
                  Verify Equilibrium Preview
                </button>
                <button
                  type="button"
                  onClick={handlePostBalances}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {loading ? 'Posting to Ledger...' : 'Commit Opening Balances to GL'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleImportMasterData}
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {loading ? 'Importing...' : `Import ${masterDataType}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
