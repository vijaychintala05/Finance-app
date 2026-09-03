import React from 'react';
import { Calendar, UserCheck, AlertTriangle } from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';

export const DesktopOperations: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const {
    todayOpsTab,
    setTodayOpsTab,
    reviewQueue,
    siteIssues,
    onNavigate,
    setSelectedReviewItem
  } = dashboard;

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Today's Operations & Deliverables</h2>
          <p className="text-xs text-slate-500">Live feed of scheduled site visits, drawing reviews, tasks & meetings</p>
        </div>

        {/* Operational Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60 overflow-x-auto max-w-full">
          {(['All', 'Tasks', 'Reviews', 'Site', 'Deliveries'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setTodayOpsTab(tab)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                todayOpsTab === tab
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Operations List Rows */}
      <div className="space-y-2.5">
        {/* Item 1: Client Design Review Meeting */}
        {(todayOpsTab === 'All' || todayOpsTab === 'Deliveries') && (
          <div className="p-3.5 sm:p-4 bg-slate-50 hover:bg-slate-100/70 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                    Client Kitchen Elevation Sign-off Meeting
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    11:00 AM • Greenwood
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Vijay Chintala & Priya Sharma • Presentation Room A
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigate('calendar')}
              className="self-end sm:self-auto px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-xl text-xs border border-slate-200 transition-colors cursor-pointer shrink-0"
            >
              View Agenda
            </button>
          </div>
        )}

        {/* Item 2: QA Review Item */}
        {(todayOpsTab === 'All' || todayOpsTab === 'Reviews') && reviewQueue[0] && (
          <div className="p-3.5 sm:p-4 bg-slate-50 hover:bg-slate-100/70 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center shrink-0">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                    {reviewQueue[0].drawingName}
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                    Due Today 05:00 PM
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Submitted by {reviewQueue[0].submittedBy} • Project: {reviewQueue[0].projectName}
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedReviewItem(reviewQueue[0])}
              className="self-end sm:self-auto px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shrink-0"
            >
              Open Review
            </button>
          </div>
        )}

        {/* Item 3: Critical Site Issue */}
        {(todayOpsTab === 'All' || todayOpsTab === 'Site') && siteIssues[0] && (
          <div className="p-3.5 sm:p-4 bg-slate-50 hover:bg-slate-100/70 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                    {siteIssues[0].title}
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                    Critical Snag
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {siteIssues[0].projectName} • Reported by {siteIssues[0].reportedBy}
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigate('site-management')}
              className="self-end sm:self-auto px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs border border-rose-200 transition-colors cursor-pointer shrink-0"
            >
              View Snag
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
