import React from 'react';
import { ChevronRight, Search, Star } from 'lucide-react';
import { ReportItem } from './reportTypes';

interface ReportCardGridProps {
  activeGroup: string;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  filteredReports: ReportItem[];
  dateRange: string;
  onSelectReport: (id: string) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
}

export const ReportCardGrid: React.FC<ReportCardGridProps> = ({
  activeGroup,
  searchQuery,
  setSearchQuery,
  filteredReports,
  dateRange,
  onSelectReport,
  onToggleFavorite,
}) => {
  return (
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
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search report name or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-9 pr-4 py-2 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Mobile Card Catalog Feed */}
      <div className="block lg:hidden space-y-2.5">
        {filteredReports.length === 0 ? (
          <div className="p-6 text-center text-slate-400 dark:text-slate-500 italic bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs">
            No reports found matching your criteria.
          </div>
        ) : (
          filteredReports.map((report) => (
            <div
              key={report.id}
              onClick={() => onSelectReport(report.id)}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-3.5 shadow-2xs space-y-2 active:bg-blue-50/50 dark:active:bg-slate-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                  {report.category}
                </span>
                <button
                  type="button"
                  onClick={(e) => onToggleFavorite(report.id, e)}
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
              onClick={() => onSelectReport(report.id)}
              className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col justify-between cursor-pointer relative"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    {report.category}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => onToggleFavorite(report.id, e)}
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
  );
};
