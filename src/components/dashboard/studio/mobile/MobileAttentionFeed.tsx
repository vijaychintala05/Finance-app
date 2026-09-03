import React from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';

export const MobileAttentionFeed: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const { attentionAlerts, setSelectedAttentionAlert, setShowAllAttentionModal } = dashboard;

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          <h2 className="text-sm font-extrabold text-slate-900">What Should I Do Next?</h2>
        </div>

        <button
          onClick={() => setShowAllAttentionModal(true)}
          className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-0.5 cursor-pointer"
        >
          <span>All ({attentionAlerts.length})</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="space-y-2.5">
        {attentionAlerts.slice(0, 3).map((alert) => (
          <button
            key={alert.id}
            type="button"
            onClick={() => setSelectedAttentionAlert(alert)}
            className="w-full text-left p-3 bg-slate-50 rounded-xl border border-slate-200/80 hover:border-slate-300 transition-colors space-y-2 cursor-pointer active:scale-98"
          >
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-extrabold uppercase text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                {alert.type}
              </span>
              <span className="text-slate-400 font-medium">{alert.timestamp}</span>
            </div>

            <h3 className="text-xs font-bold text-slate-900 leading-snug">{alert.title}</h3>

            <p className="text-[10px] text-slate-500 line-clamp-1">
              {alert.projectName} • {alert.detail}
            </p>

            <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold">
              <span className="text-slate-400">Assigned: {alert.owner || 'You'}</span>
              <span className="text-emerald-800 flex items-center gap-1">
                <span>{alert.actionText || 'Take Action'}</span>
                <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
