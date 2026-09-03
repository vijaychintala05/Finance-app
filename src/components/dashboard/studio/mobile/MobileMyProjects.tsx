import React from 'react';
import { ChevronRight, ArrowUpRight } from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';

export const MobileMyProjects: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const { projects, onNavigate, onSelectProject } = dashboard;

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold text-slate-900">Active Projects Health</h2>
        <button
          onClick={() => onNavigate('projects')}
          className="text-[11px] font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-0.5 cursor-pointer"
        >
          <span>View All ({projects.length})</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="space-y-2.5">
        {projects.slice(0, 3).map((p) => {
          let healthBadge = 'bg-emerald-50 text-emerald-800 border-emerald-200';
          let healthText = 'On Track';

          if (p.status === 'At Risk') {
            healthBadge = 'bg-rose-50 text-rose-700 border-rose-200';
            healthText = 'At Risk';
          } else if (p.status === 'QA Review') {
            healthBadge = 'bg-amber-50 text-amber-800 border-amber-200';
            healthText = 'Attention Required';
          }

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelectProject(p.id);
                onNavigate('projects');
              }}
              className="w-full text-left p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 cursor-pointer active:scale-98 transition-transform"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 truncate pr-2">{p.name}</h3>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border shrink-0 ${healthBadge}`}>
                  {healthText}
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                  <span>{p.currentStage}</span>
                  <span className="font-bold text-slate-700">{p.progress}%</span>
                </div>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${p.progress}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                <span>Team: {p.teamMembers.slice(0, 2).join(', ')}</span>
                <span className="font-bold text-emerald-800 flex items-center gap-0.5">
                  <span>Details</span>
                  <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
