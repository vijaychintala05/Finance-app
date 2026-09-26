import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Check, ChevronLeft, ChevronRight, Columns3, Search, Table2, TriangleAlert } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { WorkspaceReportResult } from '../../services/reportWorkspaceService';
import { FINANCE_REPORT_SOURCE_ROUTES, parseFinanceHash, buildFinanceHash, type FinanceReportRouteState } from '../../navigation/financeRoute';
import { formatCurrency, formatDate, formatIndianNumber, getStatusBadgeStyle } from '../../utils/formatters';

interface Props {
  report: WorkspaceReportResult;
  currencySymbol: string;
  visibleColumns: string[];
  onVisibleColumnsChange: (columns: string[]) => void;
  reportRoute?: FinanceReportRouteState;
  onOpenSource?: (sourceType: string, sourceId: string) => void;
}

const PAGE_SIZE = 50;
const CHART_COLORS = ['#2563eb', '#10b981', '#f59e0b'];

export const WorkspaceReportRenderer: React.FC<Props> = ({ report, currencySymbol, visibleColumns, onVisibleColumnsChange, reportRoute, onOpenSource }) => {
  const [view, setView] = useState<'table' | 'chart'>('table');
  const [search, setSearch] = useState(reportRoute?.search || '');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [page, setPage] = useState(reportRoute?.page || 1);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    setPage(reportRoute?.page || 1);
    setSearch(reportRoute?.search || '');
    if (visibleColumns.length === 0) onVisibleColumnsChange(report.columns.map((column) => column.key));
  }, [report.id, reportRoute?.reportId]);

  const selectedColumns = report.columns.filter((column) => visibleColumns.includes(column.key));
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return report.rows;
    return report.rows.filter((row) => selectedColumns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(needle)));
  }, [report.rows, search, selectedColumns]);
  const pages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const rows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const chartData = report.chart ? filteredRows.slice(0, 20).map((row) => ({ ...row, [report.chart!.categoryKey]: String(row[report.chart!.categoryKey] || 'Unspecified').slice(0, 30) })) : [];

  const displayValue = (value: unknown, type: string) => {
    if (value === null || value === undefined || value === '') return '-';
    if (type === 'money') return formatCurrency(Number(value), currencySymbol);
    if (type === 'percent') return `${formatIndianNumber(Number(value), 2)}%`;
    if (type === 'number') return formatIndianNumber(Number(value), 2);
    if (type === 'date') return formatDate(String(value));
    return String(value);
  };
  const updateReportRoute = (changes: Partial<FinanceReportRouteState>) => {
    const current = parseFinanceHash(window.location.hash);
    if (current.tab !== 'reports' || !current.report) return;
    const reportState = { ...current.report, ...changes };
    if (changes.search === '') delete reportState.search;
    try {
      const targetHash = buildFinanceHash({ tab: 'reports', report: reportState });
      window.history.replaceState(null, '', targetHash);
      setRouteError(null);
    } catch {
      setRouteError('These report filters are too large for the current URL. Reduce the filters to keep the report link shareable.');
    }
  };
  const openSource = (row: Record<string, unknown>) => {
    const sourceType = String(row.source_type || '');
    const sourceId = row.source_id;
    if (!onOpenSource || !Object.prototype.hasOwnProperty.call(FINANCE_REPORT_SOURCE_ROUTES, sourceType)) return;
    if (!(typeof sourceId === 'string' || (typeof sourceId === 'number' && Number.isFinite(sourceId)))) return;
    const boundedId = String(sourceId);
    if (!boundedId || boundedId.length > 200) return;
    onOpenSource(sourceType, boundedId);
  };
  useEffect(() => {
    if (page > pages) {
      setPage(pages);
      updateReportRoute({ page: pages });
    }
  }, [page, pages]);  const focusRoute = reportRoute || { reportId: report.id };
  const focusExists = Boolean(focusRoute.focusType && focusRoute.focusId && filteredRows.some((row) => String(row.source_type || '') === focusRoute.focusType && String(row.source_id || '') === focusRoute.focusId));
  useEffect(() => {
    if (!focusExists || !focusRoute.focusType || !focusRoute.focusId) return;
    const index = filteredRows.findIndex((row) => String(row.source_type || '') === focusRoute.focusType && String(row.source_id || '') === focusRoute.focusId);
    const focusPage = Math.floor(index / PAGE_SIZE) + 1;
    if (focusPage !== page) {
      setPage(focusPage);
      updateReportRoute({ page: focusPage });
      return;
    }
    document.querySelector('[data-report-focus="true"]')?.scrollIntoView?.({ block: 'center' });
  }, [focusExists, focusRoute.focusId, focusRoute.focusType, filteredRows, page]);

  return <div className="space-y-4">
    {routeError && <div role="alert" className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{routeError}</div>}
    {report.warnings?.map((warning) => <div key={warning} className="flex items-start gap-2 border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{warning}</div>)}

    {report.summary.length > 0 && <div className="grid border-y border-slate-200 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
      {report.summary.slice(0, 4).map((item) => <div key={item.key} className="border-b border-slate-200 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 dark:border-slate-800">
        <span className="block text-[10px] font-bold uppercase text-slate-500">{item.label}</span>
        <strong className="mt-1 block font-mono text-lg text-slate-950 dark:text-white">{displayValue(item.value, item.type)}</strong>
      </div>)}
    </div>}

    <div className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input maxLength={120} value={search} onChange={(event) => { const value = event.target.value; setSearch(value); setPage(1); updateReportRoute({ search: value, page: 1 }); }} placeholder="Search this report" className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" />
      </div>
      <div className="flex items-center gap-2">
        {report.chart && <div className="inline-flex rounded-md border border-slate-300 p-0.5 dark:border-slate-700">
          <button type="button" title="Table view" onClick={() => setView('table')} className={`cursor-pointer rounded p-1.5 ${view === 'table' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}><Table2 className="h-4 w-4" /></button>
          <button type="button" title="Chart view" onClick={() => setView('chart')} className={`cursor-pointer rounded p-1.5 ${view === 'chart' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}><BarChart3 className="h-4 w-4" /></button>
        </div>}
        <div className="relative">
          <button type="button" onClick={() => setColumnsOpen((open) => !open)} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-2 text-xs font-bold dark:border-slate-700"><Columns3 className="h-4 w-4" /> Columns</button>
          {columnsOpen && <div className="absolute right-0 top-10 z-20 max-h-72 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            {report.columns.map((column) => { const checked = visibleColumns.includes(column.key); return <button key={column.key} type="button" onClick={() => onVisibleColumnsChange(checked ? visibleColumns.filter((key) => key !== column.key) : [...visibleColumns, column.key])} className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"><span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}>{checked && <Check className="h-3 w-3" />}</span>{column.label}</button>; })}
          </div>}
        </div>
      </div>
    </div>

    {view === 'chart' && report.chart ? <div className="h-[360px] w-full pt-3">
      {chartData.length === 0 ? <div className="flex h-full items-center justify-center text-sm text-slate-400">No data to chart.</div> : <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 10, right: 12, left: 16, bottom: 70 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey={report.chart.categoryKey} angle={-35} textAnchor="end" interval={0} height={84} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={(value) => formatCurrency(Number(value), currencySymbol)} /><Legend />{report.chart.valueKeys.map((series, index) => <Bar key={series.key} dataKey={series.key} name={series.label} fill={CHART_COLORS[index % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />)}</BarChart></ResponsiveContainer>}
    </div> : <div className="overflow-x-auto border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-max text-left text-xs">
        <thead className="sticky top-0 bg-slate-100 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr>{selectedColumns.map((column) => <th key={column.key} className={`whitespace-nowrap px-3 py-2.5 ${column.align === 'right' ? 'text-right' : ''}`}>{column.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.length === 0 ? <tr><td colSpan={Math.max(1, selectedColumns.length)} className="px-4 py-14 text-center text-slate-400">No records matched the selected filters.</td></tr> : rows.map((row, rowIndex) => <tr key={`${String(row.source_id || '')}-${rowIndex}`} data-report-focus={String(row.source_type || '') === focusRoute.focusType && String(row.source_id || '') === focusRoute.focusId ? 'true' : undefined} className={String(row.source_type || '') === focusRoute.focusType && String(row.source_id || '') === focusRoute.focusId ? 'bg-amber-50 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/30 dark:ring-amber-800' : 'hover:bg-blue-50/40 dark:hover:bg-slate-800/60'}>{selectedColumns.map((column, columnIndex) => <td key={column.key} className={`max-w-sm px-3 py-2.5 ${column.align === 'right' ? 'text-right font-mono tabular-nums' : ''}`}>{column.type === 'status' ? <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold ${getStatusBadgeStyle(String(row[column.key] || 'Unknown'))}`}>{String(row[column.key] || 'Unknown')}</span> : columnIndex === 0 && onOpenSource && Object.prototype.hasOwnProperty.call(FINANCE_REPORT_SOURCE_ROUTES, String(row.source_type || '')) && (typeof row.source_id === 'string' || (typeof row.source_id === 'number' && Number.isFinite(row.source_id))) && String(row.source_id).length <= 200 ? <button type="button" onClick={() => openSource(row)} className="cursor-pointer text-left font-semibold text-blue-600 hover:underline dark:text-blue-400">{displayValue(row[column.key], column.type)}</button> : <span className={column.type === 'text' ? 'line-clamp-2' : 'whitespace-nowrap'}>{displayValue(row[column.key], column.type)}</span>}</td>)}</tr>)}</tbody>
      </table>
    </div>}

    {focusRoute.focusType && focusRoute.focusId && !focusExists && <p role="status" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">The source record is no longer in these report results.</p>}

    <div className="flex flex-col gap-2 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <span>{formatIndianNumber(filteredRows.length, 0)} records · generated {new Date(report.generatedAt).toLocaleString()}</span>
      {pages > 1 && <div className="flex items-center gap-2"><button type="button" title="Previous page" disabled={page === 1} onClick={() => { const next = Math.max(1, page - 1); setPage(next); updateReportRoute({ page: next }); }} className="cursor-pointer rounded border p-1 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><span>Page {page} of {pages}</span><button type="button" title="Next page" disabled={page === pages} onClick={() => { const next = Math.min(pages, page + 1); setPage(next); updateReportRoute({ page: next }); }} className="cursor-pointer rounded border p-1 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button></div>}
    </div>
  </div>;
};
