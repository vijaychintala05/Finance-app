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
    <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col shrink-0">
      <div className="p-3 sm:p-4 space-y-4">
        {/* Navigation Shortcut Folders */}
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
              <Home className="w-4 h-4 text-blue-600" />
              <span>All Reports</span>
            </div>
            <span className="text-[10px] font-extrabold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">
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

        </div>

        {/* Categorical Folders */}
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
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
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
