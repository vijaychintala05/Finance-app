import React from 'react';
import { LayoutDashboard, CheckSquare, Plus, AlertCircle, Users } from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';

export const MobileBottomActions: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const { onNavigate, onOpenNewTask, setIsSiteIssueModalOpen } = dashboard;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2 flex items-center justify-around shadow-lg md:hidden">
      <button
        onClick={() => onNavigate('dashboard')}
        className="flex flex-col items-center gap-0.5 text-emerald-800 font-extrabold text-[10px] cursor-pointer"
      >
        <LayoutDashboard className="w-5 h-5 text-emerald-600" />
        <span>Dashboard</span>
      </button>

      <button
        onClick={() => onNavigate('tasks')}
        className="flex flex-col items-center gap-0.5 text-slate-500 hover:text-slate-800 font-bold text-[10px] cursor-pointer"
      >
        <CheckSquare className="w-5 h-5" />
        <span>Tasks</span>
      </button>

      {/* Floating Center Action Button */}
      <button
        onClick={onOpenNewTask}
        aria-label="Create new task"
        title="Create new task"
        className="w-12 h-12 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center shadow-lg active:scale-95 transition-transform -mt-5 ring-4 ring-white cursor-pointer"
      >
        <Plus className="w-6 h-6" />
      </button>

      <button
        onClick={() => setIsSiteIssueModalOpen(true)}
        className="flex flex-col items-center gap-0.5 text-slate-500 hover:text-slate-800 font-bold text-[10px] cursor-pointer"
      >
        <AlertCircle className="w-5 h-5" />
        <span>Site Snag</span>
      </button>

      <button
        onClick={() => onNavigate('employees')}
        className="flex flex-col items-center gap-0.5 text-slate-500 hover:text-slate-800 font-bold text-[10px] cursor-pointer"
      >
        <Users className="w-5 h-5" />
        <span>Team</span>
      </button>
    </div>
  );
};
