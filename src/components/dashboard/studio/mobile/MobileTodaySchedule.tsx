import React from 'react';
import { Calendar, UserCheck, AlertTriangle } from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';

export const MobileTodaySchedule: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const { reviewQueue, siteIssues, setSelectedReviewItem, onNavigate, showToast } = dashboard;

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold text-slate-900">Today's Timeline</h2>
        <span className="text-[10px] font-bold text-slate-400">3 Schedule Items</span>
      </div>

      <div className="space-y-2.5">
        {/* Item 1: Meeting */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="text-xs font-bold text-slate-900">Kitchen Sign-off Meeting</span>
            </div>
            <span className="text-[9px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
              11:00 AM
            </span>
          </div>
          <p className="text-[10px] text-slate-500">Greenwood • Vijay Chintala & Priya Sharma</p>
        </div>

        {/* Item 2: QA Review */}
        {reviewQueue[0] && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <UserCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-xs font-bold text-slate-900 truncate">{reviewQueue[0].drawingName}</span>
              </div>
              <span className="text-[9px] font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shrink-0 ml-2">
                Due 05:00 PM
              </span>
            </div>
            <p className="text-[10px] text-slate-500">Submitted by {reviewQueue[0].submittedBy}</p>
            <button
              onClick={() => setSelectedReviewItem(reviewQueue[0])}
              className="mt-1 w-full py-1.5 bg-slate-900 text-white font-bold text-[10px] rounded-lg cursor-pointer"
            >
              Open Review Screen
            </button>
          </div>
        )}

        {/* Item 3: Site Snag */}
        {siteIssues[0] && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span className="text-xs font-bold text-slate-900 truncate">{siteIssues[0].title}</span>
              </div>
              <span className="text-[9px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 shrink-0 ml-2">
                Critical
              </span>
            </div>
            <p className="text-[10px] text-slate-500">{siteIssues[0].projectName} • {siteIssues[0].location}</p>
            <button
              onClick={() => onNavigate('site-management')}
              className="mt-1 w-full py-1.5 bg-rose-50 text-rose-700 font-bold text-[10px] rounded-lg border border-rose-200 cursor-pointer"
            >
              Inspect Snag
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
