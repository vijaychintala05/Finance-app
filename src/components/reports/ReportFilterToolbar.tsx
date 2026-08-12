import React from 'react';
import { Calendar, FileSpreadsheet, Printer } from 'lucide-react';

interface ReportFilterToolbarProps {
  fromDate: string;
  setFromDate: (value: string) => void;
  toDate: string;
  setToDate: (value: string) => void;
  onExportCSV: () => void;
  exportDisabled?: boolean;
}

export const ReportFilterToolbar: React.FC<ReportFilterToolbarProps> = ({
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  onExportCSV,
  exportDisabled = false,
}) => (
  <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center dark:border-slate-700/80 dark:bg-slate-800/60">
    <div className="flex flex-wrap items-center gap-2.5">
      <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      <label className="flex items-center gap-1.5 text-xs font-semibold">
        <span>From</span>
        <input type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
      </label>
      <label className="flex items-center gap-1.5 text-xs font-semibold">
        <span>To / as of</span>
        <input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
      </label>
    </div>
    <div className="flex items-center space-x-2">
      <button onClick={onExportCSV} disabled={exportDisabled} className="flex cursor-pointer items-center space-x-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /><span>Export loaded data</span>
      </button>
      <button onClick={() => window.print()} className="flex cursor-pointer items-center space-x-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        <Printer className="h-3.5 w-3.5 text-slate-600" /><span>Print</span>
      </button>
    </div>
  </div>
);
