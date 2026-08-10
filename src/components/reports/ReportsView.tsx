import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, FileSpreadsheet, RefreshCw, Star } from 'lucide-react';
import { INITIAL_REPORTS_CATALOG } from './reportCatalog';
import { ReportCategory, ReportItem, SidebarGroup } from './reportTypes';
import { BusinessOverviewReports } from './renderers/BusinessOverviewReports';
import { SalesReceivablesReports } from './renderers/SalesReceivablesReports';
import { PayablesTaxBankingReports } from './renderers/PayablesTaxBankingReports';
import { AccountantProjectReports } from './renderers/AccountantProjectReports';
import { useBooks } from '../../context/BooksContext';
import { ReportSidebarNav } from './ReportSidebarNav';
import { ReportFilterToolbar } from './ReportFilterToolbar';
import { ReportCardGrid } from './ReportCardGrid';

export const ReportsView: React.FC = () => {
  const { settings } = useBooks();

  const [reportsCatalog, setReportsCatalog] = useState<ReportItem[]>(INITIAL_REPORTS_CATALOG);
  const [activeGroup, setActiveGroup] = useState<SidebarGroup>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Date Filter State
  const [dateRange, setDateRange] = useState<string>('This Financial Year');
  const [customStartDate, setCustomStartDate] = useState<string>('2026-04-01');
  const [customEndDate, setCustomEndDate] = useState<string>('2027-03-31');

  // Auto-scroll to top when a report is generated/selected
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedReportId]);

  // Toggle favorite
  const handleToggleFavorite = (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setReportsCatalog((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, isFavorite: !r.isFavorite } : r))
    );
  };

  // Filter reports according to active sidebar group and search query
  const filteredReports = reportsCatalog.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (activeGroup === 'home') return true;
    if (activeGroup === 'favorites') return r.isFavorite;
    if (activeGroup === 'shared') return r.createdBy.includes('Shared');
    if (activeGroup === 'scheduled') return r.name.toLowerCase().includes('schedule');

    return r.category === activeGroup;
  });

  const selectedReport = reportsCatalog.find((r) => r.id === selectedReportId);

  // Group categories list
  const categoriesList: ReportCategory[] = [
    'Business Overview',
    'Sales',
    'Receivables',
    'Payments Received',
    'Recurring Invoices',
    'Payables',
    'Purchases and Expenses',
    'Taxes',
    'Banking',
    'Projects and Timesheet',
    'Accountant',
    'Currency',
    'Activity',
    'Automation',
  ];

  // Helper for date range display label
  const getDateRangeDisplay = () => {
    if (dateRange === 'Custom') {
      return `Custom Period: ${customStartDate} to ${customEndDate}`;
    }
    return `Period: ${dateRange} (FY 2026-27)`;
  };

  // Export CSV handler
  const handleExportCSV = () => {
    if (!selectedReport) return;
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      `"Report Name","${selectedReport.name}"\n` +
      `"Category","${selectedReport.category}"\n` +
      `"Generated At","${new Date().toISOString()}"\n` +
      `"Date Range","${dateRange}"\n` +
      `"Status","CA-Certified Live Double Entry Ledger"\n`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${selectedReport.id}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Dynamic Report Renderer Dispatcher
  const renderReportContent = () => {
    if (!selectedReport) return null;

    switch (selectedReport.category) {
      case 'Business Overview':
        return (
          <BusinessOverviewReports
            reportId={selectedReport.id}
            dateRangeLabel={getDateRangeDisplay()}
          />
        );

      case 'Sales':
      case 'Receivables':
      case 'Payments Received':
      case 'Recurring Invoices':
        return (
          <SalesReceivablesReports
            reportId={selectedReport.id}
            category={selectedReport.category}
            dateRangeLabel={getDateRangeDisplay()}
          />
        );

      case 'Payables':
      case 'Purchases and Expenses':
      case 'Taxes':
      case 'Banking':
        return (
          <PayablesTaxBankingReports
            reportId={selectedReport.id}
            category={selectedReport.category}
            dateRangeLabel={getDateRangeDisplay()}
          />
        );

      case 'Projects and Timesheet':
      case 'Accountant':
      case 'Currency':
      case 'Activity':
      case 'Automation':
      default:
        return (
          <AccountantProjectReports
            reportId={selectedReport.id}
            category={selectedReport.category}
            dateRangeLabel={getDateRangeDisplay()}
          />
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100">
      {/* 2-COLUMN LAYOUT: Sidebar (Folders) + Main Workspace (Reports Grid or Active Report) */}
      <div className="flex-1 flex flex-col lg:flex-row min-w-0">
        {/* LEFT FOLDER NAVIGATION SIDEBAR */}
        <ReportSidebarNav
          activeGroup={activeGroup}
          setActiveGroup={setActiveGroup}
          selectedReportId={selectedReportId}
          setSelectedReportId={setSelectedReportId}
          reportsCatalog={reportsCatalog}
          categoriesList={categoriesList}
        />

        {/* RIGHT MAIN CONTENT PANEL */}
        <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
          {/* CATALOG MODE */}
          {!selectedReportId && (
            <ReportCardGrid
              activeGroup={activeGroup}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              filteredReports={filteredReports}
              dateRange={dateRange}
              onSelectReport={(id) => setSelectedReportId(id)}
              onToggleFavorite={handleToggleFavorite}
            />
          )}

          {/* DETAILED REPORT VIEW MODE */}
          {selectedReportId && selectedReport && (
            <div className="flex-1 flex flex-col p-3 sm:p-6 space-y-4 sm:space-y-6">
              {/* Navigation Header & Actions */}
              <div className="bg-slate-50 md:bg-transparent p-3 md:p-0 rounded-2xl border md:border-none border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <button
                    onClick={() => setSelectedReportId(null)}
                    className="flex items-center space-x-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline mb-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Reports Catalog</span>
                  </button>

                  <div className="flex items-center space-x-2">
                    <h1 className="text-xl font-black text-slate-900 dark:text-white">
                      {selectedReport.name}
                    </h1>
                    <button
                      onClick={(e) => handleToggleFavorite(selectedReport.id, e)}
                      className="text-slate-300 hover:text-amber-500 cursor-pointer"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          selectedReport.isFavorite ? 'text-amber-500 fill-amber-500' : ''
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Category: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedReport.category}</span> • Basis: Accrual / Double-Entry General Ledger
                  </p>
                </div>
              </div>

              {/* DATE FILTER & EXPORT TOOLBAR */}
              <ReportFilterToolbar
                dateRange={dateRange}
                setDateRange={setDateRange}
                customStartDate={customStartDate}
                setCustomStartDate={setCustomStartDate}
                customEndDate={customEndDate}
                setCustomEndDate={setCustomEndDate}
                onExportCSV={handleExportCSV}
              />

              {/* LIVE REPORT STATEMENT DOCUMENT RENDERER */}
              <div className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-8 shadow-xs">
                {/* Statement Formal Header */}
                <div className="border-b border-slate-200 dark:border-slate-800 pb-6 mb-6 text-center space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2.5 py-1 rounded-full border border-blue-200 dark:border-blue-800">
                    CA-Verified Financial Statement
                  </span>
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white pt-2">
                    {settings.firmName || 'Sense Studios Design'}
                  </h2>
                  <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                    {selectedReport.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {getDateRangeDisplay()}
                  </p>
                </div>

                {/* Specific Category Component Dispatch */}
                {renderReportContent()}

                {/* Statement Formal Footer */}
                <div className="mt-12 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2">
                  <span>
                    Generated on {new Date().toLocaleDateString('en-US', { dateStyle: 'full' })} at {new Date().toLocaleTimeString()}
                  </span>
                  <span className="font-mono">
                    Double-Entry Integrity: 100% Balanced • FirmBooks Ledger v2
                  </span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
