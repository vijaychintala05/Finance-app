import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Folder,
  Home,
  PieChart,
  Printer,
  RefreshCw,
  Search,
  Share2,
  Star,
} from 'lucide-react';
import { INITIAL_REPORTS_CATALOG } from './reportCatalog';
import { ReportCategory, ReportItem, SidebarGroup } from './reportTypes';
import { BusinessOverviewReports } from './renderers/BusinessOverviewReports';
import { SalesReceivablesReports } from './renderers/SalesReceivablesReports';
import { PayablesTaxBankingReports } from './renderers/PayablesTaxBankingReports';
import { AccountantProjectReports } from './renderers/AccountantProjectReports';
import { useBooks } from '../../context/BooksContext';

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
    const csvContent = `data:text/csv;charset=utf-8,Report Name,Category,Date Range,Firm\n"${selectedReport.name}","${selectedReport.category}","${getDateRangeDisplay()}","${settings.firmName}"`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${selectedReport.id}_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 p-2 sm:p-5">
      <div className="max-w-[1600px] mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden min-h-[820px] flex flex-col md:flex-row">
        {/* LEFT SIDEBAR NAVIGATION */}
        <aside className={`${selectedReportId ? 'hidden md:block' : 'block md:block'} w-full md:w-64 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3 md:p-4 space-y-3 md:space-y-6 shrink-0`}>
          {/* Mobile Horizontal Category Filter Bar (md:hidden) */}
          <div className="block md:hidden space-y-2.5 pb-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Financial Reports
              </span>
              <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-900">
                {filteredReports.length} Available
              </span>
            </div>

            {/* Scrollable Pills */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <button
                onClick={() => {
                  setActiveGroup('home');
                  setSelectedReportId(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  activeGroup === 'home'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                All
              </button>
              <button
                onClick={() => {
                  setActiveGroup('favorites');
                  setSelectedReportId(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
                  activeGroup === 'favorites'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Star className="w-3 h-3 fill-current" />
                Favorites ({reportsCatalog.filter((r) => r.isFavorite).length})
              </button>

              {categoriesList.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveGroup(cat);
                    setSelectedReportId(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    activeGroup === cat
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop Classic Vertical Navigation (hidden md:block) */}
          <div className="hidden md:block space-y-6">
            {/* System Navigation */}
            <div className="space-y-1">
              <button
                onClick={() => {
                  setActiveGroup('home');
                  setSelectedReportId(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                  activeGroup === 'home' && !selectedReportId
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Home className="w-4 h-4 text-slate-500" />
                  <span>Home</span>
                </div>
                <span className="text-[10px] font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 rounded-full">
                  {reportsCatalog.length}
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveGroup('favorites');
                  setSelectedReportId(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                  activeGroup === 'favorites' && !selectedReportId
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-bold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span>Favorites</span>
                </div>
                <span className="text-[10px] font-extrabold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">
                  {reportsCatalog.filter((r) => r.isFavorite).length}
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveGroup('shared');
                  setSelectedReportId(null);
                }}
                className={`w-full flex items-center space-x-2 px-3 py-2 text-xs font-semibold rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
                  activeGroup === 'shared' ? 'bg-slate-200 font-bold' : ''
                }`}
              >
                <Share2 className="w-4 h-4 text-slate-500" />
                <span>Shared Reports</span>
              </button>

              <button
                onClick={() => {
                  setActiveGroup('scheduled');
                  setSelectedReportId(null);
                }}
                className={`w-full flex items-center space-x-2 px-3 py-2 text-xs font-semibold rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
                  activeGroup === 'scheduled' ? 'bg-slate-200 font-bold' : ''
                }`}
              >
                <Clock className="w-4 h-4 text-slate-500" />
                <span>Scheduled Reports</span>
              </button>
            </div>

            {/* REPORT CATEGORY Folders Header */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h4 className="px-3 text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                REPORT CATEGORY
              </h4>

              <div className="space-y-0.5">
                {categoriesList.map((cat) => {
                  const categoryCount = reportsCatalog.filter((r) => r.category === cat).length;
                  const isSelected = activeGroup === cat && !selectedReportId;

                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        setActiveGroup(cat);
                        setSelectedReportId(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-xl transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white font-bold shadow-xs'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <Folder
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isSelected ? 'text-white' : 'text-slate-400'
                          }`}
                        />
                        <span className="truncate">{cat}</span>
                      </div>
                      {categoryCount > 0 && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${
                            isSelected
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {categoryCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* RIGHT MAIN CONTENT PANEL */}
        <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
          {/* CATALOG MODE */}
          {!selectedReportId && (
            <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 flex-1 flex flex-col">
              {/* Top Header & Search bar */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                    <span>
                      {activeGroup === 'home'
                        ? 'All Reports'
                        : activeGroup === 'favorites'
                        ? 'Favorite Reports'
                        : activeGroup === 'shared'
                        ? 'Shared Reports'
                        : activeGroup === 'scheduled'
                        ? 'Scheduled Reports'
                        : `${activeGroup} Reports`}
                    </span>
                    <span className="text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2.5 py-0.5 rounded-full">
                      {filteredReports.length}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Select any accounting report to generate live CA-precision financial statements
                  </p>
                </div>

                {/* Search Box */}
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search report name or keyword..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-9 pr-4 py-2 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Mobile Card Catalog Feed (lg:hidden) */}
              <div className="block lg:hidden space-y-2.5">
                {filteredReports.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 dark:text-slate-500 italic bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs">
                    No reports found matching your criteria.
                  </div>
                ) : (
                  filteredReports.map((report) => (
                    <div
                      key={report.id}
                      onClick={() => setSelectedReportId(report.id)}
                      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-3.5 shadow-2xs space-y-2 active:bg-blue-50/50 dark:active:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <span className="bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                          {report.category}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleToggleFavorite(report.id, e)}
                          className="p-1 text-slate-300 hover:text-amber-500 cursor-pointer"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              report.isFavorite ? 'text-amber-500 fill-amber-500' : ''
                            }`}
                          />
                        </button>
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{report.name}</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{report.description || 'Generate CA-precision report statement'}</p>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                        <span>By {report.createdBy}</span>
                        <span className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-950/80 px-2 py-1 rounded-lg">
                          <span>View Statement</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Reports Grid Gallery */}
              <div className="hidden lg:grid grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto flex-1 p-1">
                {filteredReports.length === 0 ? (
                  <div className="col-span-full p-12 text-center text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800">
                    No accounting reports found matching your filter criteria.
                  </div>
                ) : (
                  filteredReports.map((report) => (
                    <div
                      key={report.id}
                      onClick={() => setSelectedReportId(report.id)}
                      className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col justify-between cursor-pointer relative"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                            {report.category}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleToggleFavorite(report.id, e)}
                            className="p-1 text-slate-300 hover:text-amber-500 transition-colors cursor-pointer"
                            title="Toggle Favorite"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                report.isFavorite ? 'text-amber-500 fill-amber-500' : ''
                              }`}
                            />
                          </button>
                        </div>

                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {report.name}
                        </h3>

                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                          {report.description || 'Generate CA-precision financial statement with full audit trail'}
                        </p>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-medium">
                          Period: {dateRange}
                        </span>
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center space-x-1 group-hover:translate-x-0.5 transition-transform">
                          <span>Run Report</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* DETAILED REPORT VIEW MODE */}
          {selectedReportId && selectedReport && (
            <div className="flex-1 flex flex-col p-3 sm:p-6 space-y-4 sm:space-y-6">
              {/* Navigation Header & Actions */}
              <div className="bg-slate-50 md:bg-transparent p-3 md:p-0 rounded-2xl border md:border-none border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <button
                    onClick={() => setSelectedReportId(null)}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 flex items-center space-x-1.5 cursor-pointer mb-2 shadow-xs"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to All Reports</span>
                  </button>

                  <div className="flex items-center space-x-2 sm:space-x-3">
                    <h2 className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-slate-100">
                      {selectedReport.name}
                    </h2>
                    <span className="text-[10px] sm:text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-full">
                      {selectedReport.category}
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {selectedReport.description}
                  </p>
                </div>

                {/* Print & Export Actions */}
                <div className="flex items-center gap-2 w-full md:w-auto pt-2 md:pt-0 border-t md:border-none border-slate-200">
                  <button
                    onClick={(e) => handleToggleFavorite(selectedReport.id, e)}
                    className="p-2 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer bg-white"
                    title="Favorite Report"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        selectedReport.isFavorite ? 'text-amber-500 fill-amber-500' : 'text-slate-400'
                      }`}
                    />
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="flex-1 md:flex-none px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-colors shadow-2xs"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print PDF</span>
                  </button>

                  <button
                    onClick={handleExportCSV}
                    className="flex-1 md:flex-none px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer hover:bg-slate-50"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* DATE RANGE FILTER TOOLBAR */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 sm:p-4 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span>Period:</span>
                  </div>

                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 md:flex-none"
                  >
                    <option value="This Financial Year">This Financial Year (FY 2026-27)</option>
                    <option value="This Quarter">This Quarter (Q1 2026)</option>
                    <option value="Last Quarter">Last Quarter (Q4 2025)</option>
                    <option value="This Month">This Month (July 2026)</option>
                    <option value="Custom">Custom Date Range</option>
                  </select>

                  {dateRange === 'Custom' && (
                    <div className="flex items-center space-x-1.5 w-full md:w-auto mt-1 md:mt-0">
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium rounded-xl px-2 py-1"
                      />
                      <span className="text-xs text-slate-400">to</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium rounded-xl px-2 py-1"
                      />
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center space-x-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>100% CA Level Double-Entry Precision</span>
                </div>
              </div>

              {/* RENDER DYNAMIC REPORT IMPLEMENTATION */}
              <div className="flex-1 overflow-x-auto pt-1">
                {selectedReport.category === 'Business Overview' && (
                  <BusinessOverviewReports reportId={selectedReport.id} dateRangeLabel={getDateRangeDisplay()} />
                )}

                {(selectedReport.category === 'Sales' ||
                  selectedReport.category === 'Receivables' ||
                  selectedReport.category === 'Payments Received' ||
                  selectedReport.category === 'Recurring Invoices') && (
                  <SalesReceivablesReports reportId={selectedReport.id} dateRangeLabel={getDateRangeDisplay()} />
                )}

                {(selectedReport.category === 'Payables' ||
                  selectedReport.category === 'Purchases and Expenses' ||
                  selectedReport.category === 'Taxes' ||
                  selectedReport.category === 'Banking') && (
                  <PayablesTaxBankingReports reportId={selectedReport.id} dateRangeLabel={getDateRangeDisplay()} />
                )}

                {(selectedReport.category === 'Projects and Timesheet' ||
                  selectedReport.category === 'Accountant' ||
                  selectedReport.category === 'Currency' ||
                  selectedReport.category === 'Activity' ||
                  selectedReport.category === 'Automation') && (
                  <AccountantProjectReports reportId={selectedReport.id} dateRangeLabel={getDateRangeDisplay()} />
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

