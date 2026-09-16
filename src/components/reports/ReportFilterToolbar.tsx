import React from 'react';
import { Calendar, FileSpreadsheet, FileText, Printer, Save } from 'lucide-react';
import { ReportPeriodMode } from '../../services/authoritativeReportService';

interface ReportFilterToolbarProps {
  fromDate: string;
  setFromDate: (value: string) => void;
  toDate: string;
  setToDate: (value: string) => void;
  onExport: (format: 'csv' | 'xlsx' | 'pdf') => void;
  periodMode: ReportPeriodMode;
  onSaveView: () => void;
  exportDisabled?: boolean;
  availableExportFormats?: Array<'csv' | 'xlsx' | 'pdf'>;
  projectFilter?: {
    projectId: string;
    onChange: (value: string) => void;
    projects: Array<{ id: string; code: string; name: string }>;
  };
  additionalFilters?: Array<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }>;
}

export const ReportFilterToolbar: React.FC<ReportFilterToolbarProps> = ({
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  onExport,
  periodMode,
  onSaveView,
  exportDisabled = false,
  availableExportFormats = ['csv', 'xlsx', 'pdf'],
  projectFilter,
  additionalFilters = [],
}) => {
  const applyPreset = (preset: 'today' | 'mtd' | 'qtd' | 'ytd') => {
    const now = new Date();
    const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const start = preset === 'today' ? now
      : preset === 'mtd' ? new Date(now.getFullYear(), now.getMonth(), 1)
        : preset === 'qtd' ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
          : new Date(now.getFullYear(), 0, 1);
    setFromDate(iso(start));
    setToDate(iso(now));
  };

  return (
  <div className="flex flex-col items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 xl:flex-row xl:items-center dark:border-slate-700/80 dark:bg-slate-800/60">
    <div className="flex flex-wrap items-center gap-2.5">
      <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      {periodMode === 'range' && <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">{(['today', 'mtd', 'qtd', 'ytd'] as const).map((preset) => <button key={preset} type="button" onClick={() => applyPreset(preset)} className="cursor-pointer rounded px-2 py-1 text-[10px] font-black uppercase text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800">{preset}</button>)}</div>}
      {periodMode === 'range' && <label className="flex items-center gap-1.5 text-xs font-semibold">
          <span>From</span>
          <input type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
        </label>}
      <label className="flex items-center gap-1.5 text-xs font-semibold">
        <span>{periodMode === 'as_of' ? 'As of' : 'To'}</span>
        <input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
      </label>
      {projectFilter && <label className="flex min-w-48 items-center gap-1.5 text-xs font-semibold">
        <span>Project</span>
        <select value={projectFilter.projectId} onChange={(event) => projectFilter.onChange(event.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
          <option value="">All projects</option>
          {projectFilter.projects.map((project) => <option key={project.id} value={project.id}>[{project.code}] {project.name}</option>)}
        </select>
      </label>}
      {additionalFilters.map((filter) => <label key={filter.label} className="flex min-w-40 items-center gap-1.5 text-xs font-semibold"><span>{filter.label}</span><select value={filter.value} onChange={(event) => filter.onChange(event.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"><option value="">All</option>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={onSaveView} className="flex cursor-pointer items-center space-x-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        <Save className="h-3.5 w-3.5 text-blue-600" /><span>Save view</span>
      </button>
      <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {availableExportFormats.includes('csv') && <button title="Export CSV" onClick={() => onExport('csv')} disabled={exportDisabled} className="flex cursor-pointer items-center gap-1 border-r border-slate-200 px-2.5 py-1.5 text-xs font-bold disabled:opacity-40 dark:border-slate-700"><FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />CSV</button>}
        {availableExportFormats.includes('xlsx') && <button title="Export Excel" onClick={() => onExport('xlsx')} disabled={exportDisabled} className="cursor-pointer border-r border-slate-200 px-2.5 py-1.5 text-xs font-bold disabled:opacity-40 dark:border-slate-700">Excel</button>}
        {availableExportFormats.includes('pdf') && <button title="Export PDF" onClick={() => onExport('pdf')} disabled={exportDisabled} className="flex cursor-pointer items-center gap-1 px-2.5 py-1.5 text-xs font-bold disabled:opacity-40"><FileText className="h-3.5 w-3.5 text-rose-600" />PDF</button>}
      </div>
      <button onClick={() => window.print()} className="flex cursor-pointer items-center space-x-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        <Printer className="h-3.5 w-3.5 text-slate-600" /><span>Print</span>
      </button>
    </div>
  </div>
  );
};
