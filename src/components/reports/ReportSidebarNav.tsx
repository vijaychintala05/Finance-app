import React from 'react';
import { Folder, Home, Star } from 'lucide-react';
import { ReportCategory, ReportItem, SidebarGroup } from './reportTypes';

interface ReportSidebarNavProps {
  activeGroup: SidebarGroup;
  setActiveGroup: (group: SidebarGroup) => void;
  selectedReportId: string | null;
  setSelectedReportId: (id: string | null) => void;
  reportsCatalog: ReportItem[];
  categoriesList: ReportCategory[];
}

export const ReportSidebarNav: React.FC<ReportSidebarNavProps> = ({
  activeGroup,
  setActiveGroup,
  selectedReportId,
  setSelectedReportId,
  reportsCatalog,
  categoriesList,
}) => {
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex gap-1 overflow-x-auto p-2 lg:block lg:space-y-4 lg:overflow-visible lg:p-4">
        {/* Navigation Shortcut Folders */}
        <div className="flex shrink-0 gap-1 lg:block lg:space-y-1">
          <button
            onClick={() => {
              setActiveGroup('home');
              setSelectedReportId(null);
            }}
            className={`flex w-auto shrink-0 items-center justify-between rounded-md px-3 py-2 text-xs font-semibold transition-colors lg:w-full ${
              activeGroup === 'home' && !selectedReportId
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Home className="w-4 h-4 text-blue-600" />
              <span>All Reports</span>
            </div>
            <span className="ml-2 hidden rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-300 lg:inline">
              {reportsCatalog.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveGroup('favorites');
              setSelectedReportId(null);
            }}
            className={`flex w-auto shrink-0 items-center justify-between rounded-md px-3 py-2 text-xs font-semibold transition-colors lg:w-full ${
              activeGroup === 'favorites' && !selectedReportId
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-bold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span>Favorites</span>
            </div>
            <span className="ml-2 hidden rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-300 lg:inline">
              {reportsCatalog.filter((r) => r.isFavorite).length}
            </span>
          </button>

        </div>

        {/* Categorical Folders */}
        <div className="shrink-0 lg:space-y-2 lg:border-t lg:border-slate-200 lg:pt-2 dark:lg:border-slate-800">
          <h4 className="hidden px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 lg:block">
            REPORT CATEGORY
          </h4>

          <div className="flex gap-1 lg:block lg:space-y-0.5">
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
                  className={`flex w-auto shrink-0 items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors lg:w-full lg:py-1.5 ${
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
                      className={`ml-2 hidden shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold lg:inline ${
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
  );
};
