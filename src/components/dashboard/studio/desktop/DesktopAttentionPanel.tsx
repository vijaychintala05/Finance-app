import React from 'react';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';

export const DesktopAttentionPanel: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const { attentionAlerts, setShowAllAttentionModal, setSelectedAttentionAlert } = dashboard;

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Needs Your Attention</h2>
            <p className="text-xs text-slate-500">Critical operational bottlenecks, overdue items & site escalation alerts</p>
          </div>
        </div>

        <button
          onClick={() => setShowAllAttentionModal(true)}
          className="text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center gap-1 cursor-pointer bg-slate-100/80 hover:bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 transition-colors"
        >
          <span>View All ({attentionAlerts.length})</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {attentionAlerts.slice(0, 4).map((alert) => (
          <button
            key={alert.id}
            type="button"
            onClick={() => setSelectedAttentionAlert(alert)}
            className="w-full text-left p-4 bg-slate-50/70 hover:bg-slate-100/80 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all cursor-pointer space-y-3 group flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-extrabold uppercase tracking-wide text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                  {alert.type}
                </span>
                <span className="text-slate-400 font-bold">{alert.timestamp}</span>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-900 group-hover:text-emerald-800 transition-colors line-clamp-2">
                  {alert.title}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                  {alert.projectName} • {alert.detail}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-bold text-slate-700">
              <span className="text-slate-500 font-medium">Action Needed</span>
              <span className="text-emerald-800 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                {alert.actionText || 'Resolve'}
                <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
