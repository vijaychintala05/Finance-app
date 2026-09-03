import React from 'react';
import { Plus, AlertCircle, Calendar, Clock, FileCheck } from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';

export const MobileQuickActions: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const { onOpenNewTask, setIsSiteIssueModalOpen, setIsMeetingModalOpen, showToast, onNavigate, setActiveKpiDrawer } = dashboard;

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
        Quick Actions
      </span>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-300" aria-label="Quick actions">
        <button
          onClick={onOpenNewTask}
          className="px-3 py-2 bg-emerald-500 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer active:scale-95 transition-transform"
        >
          <Plus className="w-4 h-4" />
          <span>New Task</span>
        </button>

        <button
          onClick={() => setIsSiteIssueModalOpen(true)}
          className="px-3 py-2 bg-rose-50 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-transform"
        >
          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
          <span>+ Site Snag</span>
        </button>

        <button
          onClick={() => setIsMeetingModalOpen(true)}
          className="px-3 py-2 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-transform"
        >
          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
          <span>Meeting</span>
        </button>

        <button
          onClick={() => {
            showToast("Opening daily time tracker...");
            onNavigate('time-log');
          }}
          className="px-3 py-2 bg-amber-50 text-amber-800 font-bold text-xs rounded-xl border border-amber-200 flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-transform"
        >
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>Log Time</span>
        </button>

        <button
          onClick={() => setActiveKpiDrawer('reviews')}
          className="px-3 py-2 bg-slate-100 text-slate-800 font-bold text-xs rounded-xl border border-slate-200 flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-transform"
        >
          <FileCheck className="w-3.5 h-3.5 text-slate-600" />
          <span>QA Queue</span>
        </button>
      </div>
    </div>
  );
};
