import React from 'react';
import { ChevronRight, Users, AlertTriangle } from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';

export const DesktopTeamCapacity: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const { employees, onNavigate } = dashboard;

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Studio Team Workload & Active Tasks</h2>
            <p className="text-xs text-slate-500">Employee task loads, capacity bottlenecks & QA pass metrics</p>
          </div>
        </div>

        <button
          onClick={() => onNavigate('employees')}
          className="text-xs font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-1 cursor-pointer bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200"
        >
          <span>Team Directory</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {employees.slice(0, 3).map((emp) => {
          let classification = 'Balanced';
          let classBg = 'bg-sky-50 text-sky-800 border-sky-200';

          if (emp.workload > 90) {
            classification = 'Overloaded';
            classBg = 'bg-rose-50 text-rose-700 border-rose-200';
          } else if (emp.workload > 75) {
            classification = 'Near Capacity';
            classBg = 'bg-amber-50 text-amber-800 border-amber-200';
          } else if (emp.workload < 50) {
            classification = 'Available';
            classBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
          }

          const missingLog = emp.id === 'EMP-03';

          return (
            <div key={emp.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={emp.avatar}
                    alt={emp.name}
                    className="w-9 h-9 rounded-full object-cover ring-2 ring-white shrink-0"
                  />
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 truncate">{emp.name}</h4>
                    <p className="text-[10px] text-slate-500 font-medium truncate">{emp.role}</p>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${classBg}`}>
                  {classification}
                </span>
              </div>

              {/* Workload Progress Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-700">
                  <span>Workload ({emp.workload}%)</span>
                  <span>{Math.round((emp.workload / 100) * 40)} / 40 hrs</span>
                </div>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      emp.workload > 90 ? 'bg-rose-500' :
                      emp.workload > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${emp.workload}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-600 bg-white p-2 rounded-xl border border-slate-200/60">
                <span>Active Tasks: <strong className="text-slate-900">{emp.activeTasksCount}</strong></span>
                <span>QA Pass: <strong className="text-emerald-700">{emp.qaPassRate}%</strong></span>
              </div>

              {missingLog && (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 p-2 rounded-xl border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Missing yesterday's daily log</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
