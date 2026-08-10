import React, { useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { Account, FirmSettings } from '../../types';

interface ImportStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
  settings: FirmSettings;
}

export const ImportStatementModal: React.FC<ImportStatementModalProps> = ({
  isOpen,
  onClose,
  account,
  settings,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  if (!isOpen || !account) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleImport = () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setTimeout(() => {
      setIsUploading(false);
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setSelectedFile(null);
        onClose();
      }, 1200);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
              Import Bank Statement
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {account.name} (#{account.code})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Upload your electronic bank statement file (.CSV, .OFX, .QBO, .CAMT.053) to automatically parse lines and match with recorded GL entries.
          </p>

          {/* DROPZONE */}
          <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-500 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50 dark:bg-slate-800/40">
            <input
              type="file"
              accept=".csv,.ofx,.qbo,.txt,.xlsx"
              onChange={handleFileChange}
              className="hidden"
              id="statement-upload-input"
            />
            <label htmlFor="statement-upload-input" className="cursor-pointer space-y-2 block">
              <FileSpreadsheet className="w-10 h-10 text-blue-500 mx-auto" />
              {selectedFile ? (
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{selectedFile.name}</p>
                  <p className="text-[10px] text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Click to upload bank file</p>
                  <p className="text-[10px] text-slate-400">Supports CSV, OFX, QBO, and Excel formats</p>
                </div>
              )}
            </label>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
            <span>Auto-matching algorithm enabled</span>
            <button
              onClick={() => {
                const sampleCSV = "Date,Description,Amount,Reference\n2026-07-28,Client Deposit,15400.00,DEP-8841\n2026-07-25,Rent Payment,-4500.00,CHK-1092\n2026-07-20,AWS Cloud,-1280.00,ACH-4910";
                const blob = new Blob([sampleCSV], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${account.code}_sample_statement.csv`;
                a.click();
              }}
              className="text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center space-x-1"
            >
              <Download className="w-3 h-3" />
              <span>Sample CSV</span>
            </button>
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            disabled={!selectedFile || isUploading}
            onClick={handleImport}
            className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-xs flex items-center space-x-1.5 ${
              !selectedFile || isUploading
                ? 'bg-slate-300 dark:bg-slate-800 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer'
            }`}
          >
            {isSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                <span>Imported!</span>
              </>
            ) : isUploading ? (
              <span>Parsing Statement...</span>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Upload & Match Lines</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
