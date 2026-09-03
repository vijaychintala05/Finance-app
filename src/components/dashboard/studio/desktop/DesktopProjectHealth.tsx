import React from 'react';
import { ChevronRight, ArrowUpRight } from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';

export const DesktopProjectHealth: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const { projects, onNavigate, onSelectProject } = dashboard;

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Active Projects Health Matrix</h2>
          <p className="text-xs text-slate-500">Live operational status, drawing progress, site delay risks & team allocation</p>
        </div>
        <button
          onClick={() => onNavigate('projects')}
          className="text-xs font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-1 cursor-pointer bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200"
        >
          <span>All Projects ({projects.length})</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Projects Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-slate-50/50">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/80 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <th className="p-3.5 pl-4">Project Name</th>
              <th className="p-3.5">Stage & Phase</th>
              <th className="p-3.5">Health Status</th>
              <th className="p-3.5">Progress</th>
              <th className="p-3.5">Lead / Team</th>
              <th className="p-3.5 pr-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60 font-medium text-slate-800">
            {projects.slice(0, 4).map((p) => {
              let healthBadge = 'bg-emerald-50 text-emerald-800 border-emerald-200';
              let healthText = 'On Track';

              if (p.status === 'At Risk') {
                healthBadge = 'bg-rose-50 text-rose-700 border-rose-200';
                healthText = 'At Risk (Site Delay)';
              } else if (p.status === 'QA Review') {
                healthBadge = 'bg-amber-50 text-amber-800 border-amber-200';
                healthText = 'Attention Required';
              }

              return (
                <tr key={p.id} className="hover:bg-slate-100/60 transition-colors">
                  <td className="p-3.5 pl-4 font-bold text-slate-900">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>{p.name}</span>
                    </div>
                  </td>
                  <td className="p-3.5 text-slate-600">{p.currentStage}</td>
                  <td className="p-3.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${healthBadge}`}>
                      {healthText}
                    </span>
                  </td>
                  <td className="p-3.5 min-w-[120px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-600">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="p-3.5 text-slate-600">{p.teamMembers.join(', ')}</td>
                  <td className="p-3.5 pr-4 text-right">
                    <button
                      onClick={() => {
                        onSelectProject(p.id);
                        onNavigate('projects');
                      }}
                      className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-lg text-xs border border-slate-200 transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <span>Open</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
