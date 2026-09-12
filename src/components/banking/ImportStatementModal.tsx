import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  HelpCircle,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';
import { Account } from '../../types';
import { BankAccount, BankStatementSourceFormat, StatementImportPreviewResponse } from '../../types/banking';
import { BankingService } from '../../services/bankingService';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface ImportStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
  bankAccount: BankAccount | null;
  onImported?: () => void;
}

export const ImportStatementModal: React.FC<ImportStatementModalProps> = ({
  isOpen,
  onClose,
  account,
  bankAccount,
  onImported,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [format, setFormat] = useState<BankStatementSourceFormat>('CSV');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [preview, setPreview] = useState<StatementImportPreviewResponse | null>(null);
  const [step, setStep] = useState<'SELECT' | 'PREVIEW'>('SELECT');

  if (!isOpen || !account) return null;

  const handleFileChange = async (selectedFile: File | null) => {
    setError('');
    setPreview(null);
    if (!selectedFile) {
      setFile(null);
      setFileContent('');
      return;
    }

    const filename = selectedFile.name;
    const extension = filename.split('.').pop()?.toLowerCase();

    // Strict validation: Reject PDF, images, OFX, MT940, CAMT
    if (['pdf', 'png', 'jpg', 'jpeg', 'webp', 'ofx', 'qif', 'mt940', 'sta', 'xml'].includes(extension || '')) {
      setError(
        'FirmBooks Banking accepts only CSV, XLSX, and XLS statement files. PDF, image scans, OFX, MT940, and CAMT formats are not supported.'
      );
      setFile(null);
      setFileContent('');
      return;
    }

    if (!['csv', 'xlsx', 'xls'].includes(extension || '')) {
      setError('Please upload a valid CSV, XLSX, or XLS bank statement file.');
      setFile(null);
      setFileContent('');
      return;
    }

    setFile(selectedFile);
    const sourceFmt: BankStatementSourceFormat =
      extension === 'xlsx' ? 'XLSX' : extension === 'xls' ? 'XLS' : 'CSV';
    setFormat(sourceFmt);

    // Read content
    try {
      if (sourceFmt === 'CSV') {
        const text = await selectedFile.text();
        setFileContent(text);
      } else {
        // Read Excel as base64 data URL
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          setFileContent(result);
        };
        reader.readAsDataURL(selectedFile);
      }
    } catch (err: any) {
      setError('Could not read file: ' + (err?.message || 'Unknown error'));
    }
  };

  const handlePreview = async () => {
    if (!file || !fileContent) {
      setError('Please choose a supported CSV or Excel statement file.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const previewRes = await BankingService.previewImport({
        fileContent,
        filename: file.name,
        bankAccountId: bankAccount?.id,
      });
      setPreview(previewRes);
      setStep('PREVIEW');
    } catch (err: any) {
      setError(err?.message || 'Could not parse bank statement preview');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!file || !fileContent) return;

    setBusy(true);
    setError('');
    try {
      if (bankAccount) {
        await BankingService.confirmImport({
          fileContent,
          filename: file.name,
          mode: 'USE_EXISTING',
          bankAccountId: bankAccount.id,
        });
      } else {
        await BankingService.confirmImport({
          fileContent,
          filename: file.name,
          mode: 'CREATE_NEW',
          newBankData: {
            accountName: account.name,
            bankName: preview?.detectedBankName || 'Bank',
            accountNumber: preview?.detectedAccountNumber || account.code || '1000',
            currency: preview?.currency || 'INR',
            ledgerAccountId: account.id,
          },
        });
      }
      onImported?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to import bank statement');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center border border-blue-200 dark:border-blue-800">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Import Bank Statement</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {account.name} (#{account.code}) • Zoho-Style Statement Feeds
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Policy Banner */}
          <div className="flex gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3.5 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="space-y-0.5">
              <p className="font-bold">Immutable Statement Rule</p>
              <p className="text-[11px] leading-relaxed opacity-90">
                Importing a statement uploads immutable source records and never modifies your General Ledger or creates
                expenses automatically. All matches and categorizations require explicit confirmation.
              </p>
            </div>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-2xl bg-rose-50 p-4 text-xs font-semibold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {step === 'SELECT' ? (
            <div className="space-y-4">
              {/* File Drop Area */}
              <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl hover:border-blue-500 dark:hover:border-blue-500 cursor-pointer bg-slate-50/50 dark:bg-slate-800/30 transition-all group">
                <UploadCloud className="w-12 h-12 text-slate-400 group-hover:text-blue-600 transition-colors mb-2" />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {file ? file.name : 'Click to select or drag and drop statement file'}
                </span>
                <span className="text-xs text-slate-400 mt-1">
                  Supported: <strong>CSV, XLSX, XLS</strong> (Standard netbanking exports)
                </span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>

              {file && (
                <div className="flex items-center justify-between p-3.5 bg-blue-50/60 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-800/50">
                  <div className="flex items-center gap-2.5 text-xs font-semibold text-blue-900 dark:text-blue-300">
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                    <span>{file.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-mono font-bold">
                      {format}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</span>
                </div>
              )}
            </div>
          ) : (
            /* PREVIEW STEP */
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Rows</span>
                  <span className="text-sm font-black text-slate-800 dark:text-slate-100">{preview?.totalRows}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">New Feeds</span>
                  <span className="text-sm font-black text-emerald-600">{preview?.newRowsCount}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Exact Duplicates</span>
                  <span className="text-sm font-black text-slate-500">{preview?.exactDuplicatesCount}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Discrepancy</span>
                  <span className="text-sm font-black text-slate-800 dark:text-slate-100 font-mono">
                    {formatCurrency(preview?.discrepancy || 0, preview?.currency || 'INR')}
                  </span>
                </div>
              </div>

              {preview?.statementHealthWarning && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300">
                  ⚠️ {preview.statementHealthWarning}
                </div>
              )}

              {/* Preview Rows Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-extrabold uppercase text-slate-500 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Narration</th>
                      <th className="py-2 px-3 text-right">Money In</th>
                      <th className="py-2 px-3 text-right">Money Out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(preview?.previewRows || []).slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 whitespace-nowrap font-mono text-[11px]">{formatDate(row.date)}</td>
                        <td className="py-2 px-3 max-w-xs truncate">{row.narration}</td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-600">
                          {row.moneyIn ? formatCurrency(row.moneyIn, preview?.currency || 'INR') : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-rose-600">
                          {row.moneyOut ? formatCurrency(row.moneyOut, preview?.currency || 'INR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900">
          {step === 'PREVIEW' ? (
            <button
              type="button"
              onClick={() => setStep('SELECT')}
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              ← Back to File
            </button>
          ) : (
            <div className="text-[11px] text-slate-400">
              Supported: CSV, XLSX, XLS
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {step === 'SELECT' ? (
              <button
                type="button"
                disabled={!file || busy}
                onClick={handlePreview}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
              >
                {busy ? 'Reading statement…' : 'Preview Statement →'}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirm}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{busy ? 'Importing…' : 'Confirm & Import Statement'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
