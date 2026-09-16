import React from 'react';
import { ChevronRight, Search, Star } from 'lucide-react';
import { ReportCategory } from './reportTypes';
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
  const grouped = filteredReports.reduce((groups, report) => {
    const current = groups.get(report.category) || [];
    current.push(report);
    groups.set(report.category, current);
    return groups;
  }, new Map<ReportCategory, ReportItem[]>());

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
                : `${activeGroup} Reports`}
            </span>
            <span className="text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2.5 py-0.5 rounded-full">
              {filteredReports.length}
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Every listed report uses tenant-scoped server data, with its accounting or operational basis shown in the report
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

      <div className="grid grid-cols-1 items-start gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredReports.length === 0 ? (
          <div className="border border-slate-200 p-10 text-center text-xs italic text-slate-400 md:col-span-2 xl:col-span-3 dark:border-slate-800 dark:text-slate-500">
            No reports found matching your criteria.
          </div>
        ) : (
          Array.from(grouped.entries()).map(([category, reports]) => <section key={category} className="min-w-0">
            <div className="mb-1 flex items-center justify-between border-b-2 border-slate-200 pb-2 dark:border-slate-700">
              <h3 className="text-xs font-black uppercase text-slate-700 dark:text-slate-200">{category}</h3>
              <span className="font-mono text-[10px] text-slate-400">{reports.length}</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {reports.map((report) => <div key={report.id} role="button" tabIndex={0} onClick={() => onSelectReport(report.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectReport(report.id); }} className="group flex w-full cursor-pointer items-start gap-2 py-3 text-left">
                <button type="button" title={report.isFavorite ? 'Remove from favorites' : 'Add to favorites'} onClick={(event) => onToggleFavorite(report.id, event)} className="mt-0.5 cursor-pointer text-slate-300 hover:text-amber-500"><Star className={`h-3.5 w-3.5 ${report.isFavorite ? 'fill-amber-500 text-amber-500' : ''}`} /></button>
                <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">{report.name}</span><span className="mt-0.5 line-clamp-2 block text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{report.description}</span></span>
                <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" />
              </div>)}
            </div>
          </section>)
        )}
      </div>
      <p className="mt-auto border-t border-slate-200 pt-3 text-[10px] text-slate-400 dark:border-slate-800">Default reporting period: {dateRange}</p>
    </div>
  );
};
