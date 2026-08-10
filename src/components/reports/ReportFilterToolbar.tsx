import React from 'react';
import { Calendar, Download, FileSpreadsheet, Printer, Share2 } from 'lucide-react';

interface ReportFilterToolbarProps {
  dateRange: string;
  setDateRange: (val: string) => void;
  customStartDate: string;
  setCustomStartDate: (val: string) => void;
  customEndDate: string;
  setCustomEndDate: (val: string) => void;
  onExportCSV: () => void;
}

export const ReportFilterToolbar: React.FC<ReportFilterToolbarProps> = ({
  dateRange,
  setDateRange,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  onExportCSV,
}) => {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
      {/* Date Period Controls */}
      <div className="flex items-center flex-wrap gap-2.5">
        <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-2xs">
          <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-transparent focus:outline-hidden cursor-pointer"
          >
            <option value="This Financial Year">This Financial Year (FY 2026-27)</option>
            <option value="Previous Financial Year">Previous Financial Year (FY 2025-26)</option>
            <option value="This Quarter">This Quarter (Q2 2026)</option>
            <option value="Previous Quarter">Previous Quarter (Q1 2026)</option>
            <option value="This Month">This Month</option>
            <option value="Previous Month">Previous Month</option>
            <option value="Last 12 Months">Last 12 Months Rolling</option>
            <option value="All Time">All Time</option>
            <option value="Custom">Custom Period Range</option>
          </select>
        </div>

        {dateRange === 'Custom' && (
          <div className="flex items-center space-x-1.5 text-xs font-semibold">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-xl text-xs"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-xl text-xs"
            />
          </div>
        )}
      </div>

      {/* Export & Action Buttons */}
      <div className="flex items-center space-x-2">
        <button
          onClick={onExportCSV}
          className="flex items-center space-x-1 px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer shadow-2xs transition-colors"
          title="Export CSV"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          <span>Export CSV</span>
        </button>

        <button
          onClick={() => window.print()}
          className="flex items-center space-x-1 px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer shadow-2xs transition-colors"
          title="Print Statement"
        >
          <Printer className="w-3.5 h-3.5 text-slate-600" />
          <span>Print</span>
        </button>

        <button
          onClick={() => alert('Report link copied to clipboard for collaboration!')}
          className="flex items-center space-x-1 px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer shadow-2xs transition-colors"
          title="Share Report"
        >
          <Share2 className="w-3.5 h-3.5 text-blue-600" />
          <span>Share</span>
        </button>
      </div>
    </div>
  );
};
