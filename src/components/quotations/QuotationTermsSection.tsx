import React from 'react';
import { FileText, ShieldAlert } from 'lucide-react';

interface QuotationTermsSectionProps {
  notes: string;
  setNotes: (n: string) => void;
  terms: string;
  setTerms: (t: string) => void;
}

export const QuotationTermsSection: React.FC<QuotationTermsSectionProps> = ({
  notes,
  setNotes,
  terms,
  setTerms,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      <div className="space-y-1.5">
        <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
          <FileText className="w-3.5 h-3.5 text-slate-400" />
          <span>Customer Notes</span>
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes visible to the client on the quotation..."
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y"
        />
      </div>

      <div className="space-y-1.5">
        <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
          <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
          <span>Terms & Conditions</span>
        </label>
        <textarea
          rows={3}
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder="Standard terms, validity periods, payment terms..."
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y"
        />
      </div>
    </div>
  );
};
