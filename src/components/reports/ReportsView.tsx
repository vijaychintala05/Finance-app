import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw, ShieldCheck, Star, X } from 'lucide-react';
import { INITIAL_REPORTS_CATALOG } from './reportCatalog';
import { ReportCategory, ReportItem, SidebarGroup } from './reportTypes';
import { useBooks } from '../../context/BooksContext';
import { ReportSidebarNav } from './ReportSidebarNav';
import { ReportFilterToolbar } from './ReportFilterToolbar';
import { ReportCardGrid } from './ReportCardGrid';
import { AuthoritativeReportRenderer } from './AuthoritativeReportRenderer';
import {
  CertifiedReportId,
  AUTHORITATIVE_REPORTS,
  downloadAuthoritativeReportCsv,
  fetchAuthoritativeReport,
} from '../../services/authoritativeReportService';
import { downloadWorkspaceReport, fetchWorkspaceReport, isWorkspaceReportId, WorkspaceReportResult } from '../../services/reportWorkspaceService';
import { WorkspaceReportRenderer } from './WorkspaceReportRenderer';
import { fetchSavedReportViews, saveReportView, SavedReportView } from '../../services/savedReportViewsService';

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const ReportsView: React.FC = () => {
  const { settings, projects, clients, vendors, accounts } = useBooks();
  const today = new Date();
  const [reportsCatalog, setReportsCatalog] = useState<ReportItem[]>(INITIAL_REPORTS_CATALOG);
  const [activeGroup, setActiveGroup] = useState<SidebarGroup>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => localIsoDate(new Date(today.getFullYear(), 0, 1)));
  const [toDate, setToDate] = useState(() => localIsoDate(today));
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [reportData, setReportData] = useState<any | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [savedViews, setSavedViews] = useState<SavedReportView[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savedViewName, setSavedViewName] = useState('');
  const [saveVisibility, setSaveVisibility] = useState<'PRIVATE' | 'ORGANIZATION'>('PRIVATE');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingView, setSavingView] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedReportId]);

  useEffect(() => {
    if (!selectedReportId) {
      setReportData(null);
      setError(null);
      return;
    }
    if (!settings.currencyCode || !settings.currencySymbol) {
      setReportData(null);
      setError('Organization currency metadata is unavailable. Reports are blocked to avoid ambiguous amounts.');
      return;
    }
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    const reportRequest = isWorkspaceReportId(selectedReportId)
      ? fetchWorkspaceReport(selectedReportId, {
          fromDate,
          toDate,
          projectId: selectedProjectId || undefined,
          customerId: selectedCustomerId || undefined,
          vendorId: selectedVendorId || undefined,
          accountId: selectedAccountId || undefined,
          status: selectedStatus || undefined,
        })
      : fetchAuthoritativeReport(selectedReportId as CertifiedReportId, fromDate, toDate, {
          projectId: selectedReportId === 'project_profitability' ? selectedProjectId || undefined : undefined,
        });
    reportRequest
      .then((data) => {
        if (sequence === requestSequence.current) setReportData(data);
      })
      .catch((reportError) => {
        if (sequence === requestSequence.current) {
          setReportData(null);
          setError(reportError instanceof Error ? reportError.message : 'Report generation failed');
        }
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false);
      });
  }, [selectedReportId, fromDate, toDate, selectedProjectId, selectedCustomerId, selectedVendorId, selectedAccountId, selectedStatus, reloadToken, settings.currencyCode, settings.currencySymbol]);

  useEffect(() => {
    fetchSavedReportViews().then(setSavedViews).catch(() => setSavedViews([]));
  }, []);

  const handleToggleFavorite = (reportId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setReportsCatalog((previous) => previous.map((report) => (
      report.id === reportId ? { ...report, isFavorite: !report.isFavorite } : report
    )));
  };

  const filteredReports = reportsCatalog.filter((report) => {
    const search = searchQuery.toLowerCase();
    const matchesSearch = report.name.toLowerCase().includes(search)
      || report.category.toLowerCase().includes(search)
      || report.description.toLowerCase().includes(search);
    if (!matchesSearch) return false;
    if (activeGroup === 'home') return true;
    if (activeGroup === 'favorites') return Boolean(report.isFavorite);
    return report.category === activeGroup;
  });

  const selectedReport = reportsCatalog.find((report) => report.id === selectedReportId);
  const categoriesList: ReportCategory[] = ['Business Overview', 'Sales', 'Receivables', 'Payments Received', 'Purchases and Expenses', 'Payables', 'Banking', 'Projects and Timesheet', 'Taxes', 'Accountant', 'Activity'];
  const isAuthoritativeReport = Boolean(selectedReportId && selectedReportId in AUTHORITATIVE_REPORTS);
  const periodMode = selectedReportId && isAuthoritativeReport
    ? AUTHORITATIVE_REPORTS[selectedReportId as CertifiedReportId].periodMode
    : ['comparative_balance_sheet', 'customer_balance_summary', 'vendor_balance_summary', 'bank_reconciliation_summary', 'fixed_asset_register'].includes(selectedReportId || '') ? 'as_of' : 'range';
  const periodLabel = selectedReportId && periodMode === 'as_of'
    ? `As of ${toDate}`
    : `${fromDate} through ${toDate}`;

  const saveCurrentView = async () => {
    if (!selectedReportId || !savedViewName.trim()) {
      setSaveError('Enter a name for this report view.');
      return;
    }
    setSavingView(true);
    setSaveError(null);
    try {
      await saveReportView({
        name: savedViewName.trim(),
        reportId: selectedReportId,
        fromDate,
        toDate,
        projectId: selectedReportId === 'project_profitability' ? selectedProjectId || undefined : undefined,
        visibleColumns,
        customerId: selectedCustomerId || undefined,
        vendorId: selectedVendorId || undefined,
        accountId: selectedAccountId || undefined,
        status: selectedStatus || undefined,
        visibility: saveVisibility,
      });
      setSavedViews(await fetchSavedReportViews());
      setSaveDialogOpen(false);
      setSavedViewName('');
    } catch (saveViewError) {
      setSaveError(saveViewError instanceof Error ? saveViewError.message : 'Unable to save this report view.');
    } finally {
      setSavingView(false);
    }
  };

  const loadSavedView = (view: SavedReportView) => {
    if (!reportsCatalog.some((report) => report.id === view.report_type)) return;
    setFromDate(view.config?.fromDate || fromDate);
    setToDate(view.config?.toDate || toDate);
    setSelectedProjectId(view.config?.projectId || '');
    setVisibleColumns(view.config?.visibleColumns || []);
    setSelectedCustomerId(view.config?.customerId || '');
    setSelectedVendorId(view.config?.vendorId || '');
    setSelectedAccountId(view.config?.accountId || '');
    setSelectedStatus(view.config?.status || '');
    setSelectedReportId(view.report_type);
  };

  const exportReport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    if (!selectedReportId || !reportData) return;
    try {
      if (isWorkspaceReportId(selectedReportId)) {
        await downloadWorkspaceReport(selectedReportId, { fromDate, toDate, projectId: selectedProjectId || undefined, customerId: selectedCustomerId || undefined, vendorId: selectedVendorId || undefined, accountId: selectedAccountId || undefined, status: selectedStatus || undefined }, format, visibleColumns);
      } else if (format === 'csv') {
        downloadAuthoritativeReportCsv(selectedReportId as CertifiedReportId, reportData, `${selectedReportId}_${fromDate}_${toDate}.csv`);
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Report export failed');
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <ReportSidebarNav
          activeGroup={activeGroup}
          setActiveGroup={setActiveGroup}
          selectedReportId={selectedReportId}
          setSelectedReportId={(id) => { setVisibleColumns([]); setSelectedReportId(id); }}
          reportsCatalog={reportsCatalog}
          categoriesList={categoriesList}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-white dark:bg-slate-900">
          {!selectedReportId && (
            <ReportCardGrid
              activeGroup={activeGroup}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              filteredReports={filteredReports}
              dateRange={`${fromDate} to ${toDate}`}
              onSelectReport={(id) => { setVisibleColumns([]); setSelectedReportId(id); }}
              onToggleFavorite={handleToggleFavorite}
            />
          )}

          {selectedReportId && selectedReport && (
            <div className="flex flex-1 flex-col space-y-4 p-3 sm:p-6">
              <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-200 pb-3 md:flex-row md:items-center dark:border-slate-800">
                <div>
                  <button
                    onClick={() => setSelectedReportId(null)}
                    className="mb-1.5 flex cursor-pointer items-center space-x-1 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to report catalog</span>
                  </button>
                  <div className="flex items-center space-x-2">
                    <h1 className="text-xl font-black text-slate-900 dark:text-white">{selectedReport.name}</h1>
                    <button onClick={(event) => handleToggleFavorite(selectedReport.id, event)} className="cursor-pointer text-slate-300 hover:text-amber-500">
                      <Star className={`h-4 w-4 ${selectedReport.isFavorite ? 'fill-amber-500 text-amber-500' : ''}`} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{selectedReport.description}</p>
                </div>
                <button
                  onClick={() => setReloadToken((value) => value + 1)}
                  disabled={loading}
                  className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh from ledger
                </button>
              </div>

              <ReportFilterToolbar
                fromDate={fromDate}
                setFromDate={setFromDate}
                toDate={toDate}
                setToDate={setToDate}
                onExport={exportReport}
                periodMode={periodMode}
                onSaveView={() => {
                  setSaveError(null);
                  setSavedViewName(`${selectedReport.name} view`);
                  setSaveDialogOpen(true);
                }}
                exportDisabled={!reportData || loading}
                availableExportFormats={isWorkspaceReportId(selectedReportId) ? ['csv', 'xlsx', 'pdf'] : ['csv']}
                projectFilter={['project_profitability', 'sales_by_customer', 'sales_by_item', 'invoice_details', 'expenses_by_project', 'expense_details', 'timesheet_details', 'comparative_profit_loss', 'business_ratio_analysis'].includes(selectedReportId) ? {
                  projectId: selectedProjectId,
                  onChange: setSelectedProjectId,
                  projects,
                } : undefined}
                additionalFilters={[
                  ...(['sales_by_customer', 'invoice_details', 'payments_received', 'time_to_get_paid', 'customer_balance_summary'].includes(selectedReportId) ? [{ label: 'Customer', value: selectedCustomerId, onChange: setSelectedCustomerId, options: clients.map((client) => ({ value: client.id, label: client.name })) }] : []),
                  ...(['expense_details', 'expenses_by_vendor', 'bill_details', 'purchases_by_vendor', 'payments_made', 'vendor_balance_summary'].includes(selectedReportId) ? [{ label: 'Vendor', value: selectedVendorId, onChange: setSelectedVendorId, options: vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })) }] : []),
                  ...(['expense_details', 'bank_transaction_details'].includes(selectedReportId) ? [{ label: selectedReportId === 'bank_transaction_details' ? 'Bank account' : 'Account', value: selectedAccountId, onChange: setSelectedAccountId, options: accounts.map((account) => ({ value: account.id, label: `${account.code} - ${account.name}` })) }] : []),
                  ...(['invoice_details', 'payments_received', 'expense_details', 'bill_details', 'payments_made', 'bank_transaction_details', 'fixed_asset_register', 'journal_report'].includes(selectedReportId) ? [{ label: 'Status', value: selectedStatus, onChange: setSelectedStatus, options: [{ value: 'POSTED', label: 'Posted' }, { value: 'PAID', label: 'Paid' }, { value: 'PARTIALLY PAID', label: 'Partially paid' }, { value: 'UNPAID', label: 'Unpaid' }, { value: 'MATCHED', label: 'Matched' }, { value: 'UNMATCHED', label: 'Unmatched' }, { value: 'ACTIVE', label: 'Active' }] }] : []),
                ]}
              />

              <div className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white p-4 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-6 space-y-1 border-b border-slate-200 pb-6 text-center dark:border-slate-800">
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <ShieldCheck className="h-3 w-3" /> {isWorkspaceReportId(selectedReportId) ? String((reportData as WorkspaceReportResult | null)?.basis || 'SERVER REPORT').replaceAll('_', ' ') : 'Posted-ledger report'}
                  </span>
                  <h2 className="pt-2 text-2xl font-black text-slate-900 dark:text-white">{settings.firmName}</h2>
                  <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">{selectedReport.name}</h3>
                  <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{periodLabel} · {settings.currencyCode}</p>
                </div>

                {loading && (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin" /> Reading posted journals…
                  </div>
                )}
                {!loading && error && (
                  <div className="mx-auto flex max-w-2xl items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}. No financial values are shown from stale or inferred data.</span>
                  </div>
                )}
                {!loading && !error && reportData && (
                  isWorkspaceReportId(selectedReportId)
                    ? <WorkspaceReportRenderer report={reportData as WorkspaceReportResult} currencySymbol={settings.currencySymbol} visibleColumns={visibleColumns} onVisibleColumnsChange={setVisibleColumns} />
                    : <AuthoritativeReportRenderer reportId={selectedReportId as CertifiedReportId} data={reportData} currencySymbol={settings.currencySymbol} />
                )}

                <div className="mt-12 flex flex-col items-center justify-between gap-2 border-t border-slate-200 pt-6 text-[11px] text-slate-400 sm:flex-row dark:border-slate-800">
                  <span>Values refresh from the server and are never calculated from browser demo state.</span>
                  <span className="font-mono">Integrity state is shown by each report; no unconditional certification is asserted.</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      {savedViews.length > 0 && !selectedReportId && (
        <div className="border-t border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Saved views</span>
            {savedViews.map((view) => (
              <button key={view.id} onClick={() => loadSavedView(view)} className="cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:text-slate-200">
                {view.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {saveDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Save report view">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between"><h2 className="text-base font-bold">Save report view</h2><button onClick={() => setSaveDialogOpen(false)} className="cursor-pointer p-1 text-slate-500"><X className="h-4 w-4" /></button></div>
            <label className="mt-4 block text-xs font-semibold">Name<input autoFocus value={savedViewName} onChange={(event) => setSavedViewName(event.target.value)} maxLength={160} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="mt-3 block text-xs font-semibold">Visibility<select value={saveVisibility} onChange={(event) => setSaveVisibility(event.target.value as 'PRIVATE' | 'ORGANIZATION')} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="PRIVATE">Only me</option><option value="ORGANIZATION">Everyone in organization</option></select></label>
            {saveError && <p className="mt-3 text-xs font-semibold text-rose-600">{saveError}</p>}
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setSaveDialogOpen(false)} className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-700">Cancel</button><button onClick={saveCurrentView} disabled={savingView} className="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{savingView ? 'Saving...' : 'Save view'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
};
