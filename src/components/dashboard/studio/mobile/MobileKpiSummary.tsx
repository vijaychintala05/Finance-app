import React from 'react';
import { Clock, FileCheck, AlertTriangle, Wrench } from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';

export const MobileKpiSummary: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const {
    overdueTasksCount,
    pendingReviewsCount,
    blockedTasksCount,
    openSiteIssuesCount,
    setActiveKpiDrawer
  } = dashboard;

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {/* 1. Overdue */}
      <div
        onClick={() => setActiveKpiDrawer('overdue')}
        className="p-3 bg-white rounded-2xl border border-rose-200/80 shadow-2xs space-y-1.5 cursor-pointer active:scale-98 transition-transform"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500">Overdue</span>
          <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-black text-slate-900">{overdueTasksCount}</span>
          <span className="text-[9px] font-extrabold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-200">
            Critical
          </span>
        </div>
      </div>

      {/* 2. Reviews */}
      <div
        onClick={() => setActiveKpiDrawer('reviews')}
        className="p-3 bg-white rounded-2xl border border-amber-200/80 shadow-2xs space-y-1.5 cursor-pointer active:scale-98 transition-transform"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500">Pending Reviews</span>
          <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center">
            <FileCheck className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-black text-slate-900">{pendingReviewsCount}</span>
          <span className="text-[9px] font-extrabold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
            Awaiting Sign-off
          </span>
        </div>
      </div>

      {/* 3. Blocked */}
      <div
        onClick={() => setActiveKpiDrawer('blocked')}
        className="p-3 bg-white rounded-2xl border border-rose-200/80 shadow-2xs space-y-1.5 cursor-pointer active:scale-98 transition-transform"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500">Blocked Tasks</span>
          <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-black text-slate-900">{blockedTasksCount}</span>
          <span className="text-[9px] font-extrabold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-200">
            Dependency
          </span>
        </div>
      </div>

      {/* 4. Site Snags */}
      <div
        onClick={() => setActiveKpiDrawer('issues')}
        className="p-3 bg-white rounded-2xl border border-sky-200/80 shadow-2xs space-y-1.5 cursor-pointer active:scale-98 transition-transform"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500">Site Snags</span>
          <div className="w-6 h-6 rounded-lg bg-sky-50 text-sky-800 flex items-center justify-center">
            <Wrench className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-black text-slate-900">{openSiteIssuesCount}</span>
          <span className="text-[9px] font-extrabold text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded-full border border-sky-200">
            Active
          </span>
        </div>
      </div>
    </div>
  );
};
