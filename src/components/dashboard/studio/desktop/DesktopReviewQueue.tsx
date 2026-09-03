import React from 'react';
import { ChevronRight, FileCheck, FileSignature } from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';

export const DesktopReviewQueue: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const { reviewQueue, setShowAllReviewsModal, setSelectedReviewItem, handleApproveReview } = dashboard;

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck className="w-5 h-5 text-amber-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Drawing Sign-Off & QA Review Queue</h2>
            <p className="text-xs text-slate-500">Working drawings & 3D renders waiting for Principal / Lead sign-off</p>
          </div>
        </div>

        <button
          onClick={() => setShowAllReviewsModal(true)}
          className="text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center gap-1 cursor-pointer bg-slate-100/80 hover:bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 transition-colors"
        >
          <span>Full Queue ({reviewQueue.length})</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {reviewQueue.slice(0, 3).map((item) => (
          <div
            key={item.id}
            className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all space-y-3 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-50 text-amber-800 border border-amber-200">
                  {item.correctionCycle}
                </span>
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                  {item.reviewDueDate}
                </span>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{item.drawingName}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Project: <strong className="text-slate-700">{item.projectName}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <img
                  src={item.submitterAvatar}
                  alt={item.submittedBy}
                  className="w-6 h-6 rounded-full object-cover ring-2 ring-white shrink-0"
                />
                <span className="text-[11px] font-semibold text-slate-700">
                  By {item.submittedBy} • {item.submissionTime}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2">
              <button
                onClick={() => setSelectedReviewItem(item)}
                className="flex-1 py-1.5 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-xs border border-slate-200 transition-colors cursor-pointer text-center"
              >
                Inspect
              </button>
              <button
                onClick={() => handleApproveReview(item.id)}
                className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-xl text-xs shadow-2xs transition-colors cursor-pointer text-center flex items-center justify-center gap-1"
              >
                <FileSignature className="w-3.5 h-3.5" />
                <span>Approve</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
