import React from 'react';
import { AlertTriangle, FileSpreadsheet, X } from 'lucide-react';
import { Account, FirmSettings } from '../../types';

interface ImportStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
  settings: FirmSettings;
}

export const ImportStatementModal: React.FC<ImportStatementModalProps> = ({ isOpen, onClose, account }) => {
  if (!isOpen || !account) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Import Bank Statement</h3>
              <p className="text-[11px] text-slate-500">{account.code} · {account.name}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Statement import is not enabled yet</p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                Import requires durable file storage, format-specific validation, duplicate fingerprints, balance reconciliation, a review queue, and audited posting. Files are not parsed or represented as imported in the browser.
              </p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-slate-900 dark:bg-blue-600 text-white text-xs font-bold rounded-xl">Close</button>
        </div>
      </div>
    </div>
  );
};
