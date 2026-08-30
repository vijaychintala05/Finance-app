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
import { fetchSavedReportViews, saveReportView, SavedReportView } from '../../services/savedReportViewsService';

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const ReportsView: React.FC = () => {
  const { settings } = useBooks();
  const today = new Date();
  const [reportsCatalog, setReportsCatalog] = useState<ReportItem[]>(INITIAL_REPORTS_CATALOG);
  const [activeGroup, setActiveGroup] = useState<SidebarGroup>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<CertifiedReportId | null>(null);
  const [fromDate, setFromDate] = useState(() => localIsoDate(new Date(today.getFullYear(), 0, 1)));
  const [toDate, setToDate] = useState(() => localIsoDate(today));
  const [reportData, setReportData] = useState<any | null>(null);
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
    fetchAuthoritativeReport(selectedReportId, fromDate, toDate)
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
  }, [selectedReportId, fromDate, toDate, reloadToken, settings.currencyCode, settings.currencySymbol]);

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
  const categoriesList: ReportCategory[] = ['Business Overview', 'Receivables', 'Payables', 'Accountant'];
  const periodLabel = selectedReportId && AUTHORITATIVE_REPORTS[selectedReportId].periodMode === 'as_of'
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
      await saveReportView({ name: savedViewName.trim(), reportId: selectedReportId, fromDate, toDate, visibility: saveVisibility });
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
    if (!AUTHORITATIVE_REPORTS[view.report_type]) return;
    setFromDate(view.config?.fromDate || fromDate);
    setToDate(view.config?.toDate || toDate);
    setSelectedReportId(view.report_type);
  };

  const exportCsv = () => {
    if (!selectedReportId || !reportData) return;
    downloadAuthoritativeReportCsv(selectedReportId, reportData, `${selectedReportId}_${fromDate}_${toDate}.csv`);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <ReportSidebarNav
          activeGroup={activeGroup}
          setActiveGroup={setActiveGroup}
          selectedReportId={selectedReportId}
          setSelectedReportId={(id) => setSelectedReportId(id as CertifiedReportId | null)}
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
              onSelectReport={(id) => setSelectedReportId(id as CertifiedReportId)}
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
                  <p className="text-xs text-slate-500 dark:text-slate-400">Source: tenant-scoped PostgreSQL posted ledger</p>
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
                onExportCSV={exportCsv}
                periodMode={AUTHORITATIVE_REPORTS[selectedReportId].periodMode}
                onSaveView={() => {
                  setSaveError(null);
                  setSavedViewName(`${selectedReport.name} view`);
                  setSaveDialogOpen(true);
                }}
                exportDisabled={!reportData || loading}
              />

              <div className="min-w-0 flex-1 rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-8 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-6 space-y-1 border-b border-slate-200 pb-6 text-center dark:border-slate-800">
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <ShieldCheck className="h-3 w-3" /> Posted-ledger report
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
                  <AuthoritativeReportRenderer
                    reportId={selectedReportId}
                    data={reportData}
                    currencySymbol={settings.currencySymbol}
                  />
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
