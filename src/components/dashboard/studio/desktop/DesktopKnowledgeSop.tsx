import React from 'react';
import { ChevronRight, BookOpen, Clock, ShieldCheck, HelpCircle } from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';

export const DesktopKnowledgeSop: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const { onNavigate, showToast, setSelectedSopModal } = dashboard;

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Training & SOP Knowledge</h2>
          <p className="text-xs text-slate-500">Mandatory training compliance, draft SOP approvals & employee technical Q&A</p>
        </div>
        <button
          onClick={() => onNavigate('knowledge-base')}
          className="text-xs font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-1 cursor-pointer bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200"
        >
          <span>Knowledge Base</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="divide-y divide-slate-100 bg-slate-50 rounded-2xl border border-slate-200/80 overflow-hidden">
        {/* Row 1: Mandatory Training Pending */}
        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-100/60 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">Pending Mandatory Training</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                  3 Employees
                </span>
              </div>
              <p className="text-[11px] text-slate-500">SOP-KIT-004 Modular Kitchen Working Drawing & Hardware Specifications</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('knowledge-base')}
            className="self-end sm:self-auto px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-xl text-xs border border-slate-200 transition-colors cursor-pointer shrink-0"
          >
            View Training
          </button>
        </div>

        {/* Row 2: Overdue Training */}
        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-100/60 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">Training Overdue</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                  1 Employee (Rahul Verma)
                </span>
              </div>
              <p className="text-[11px] text-slate-500">AutoCAD Layer Standards & Working Drawing Compliance SOP</p>
            </div>
          </div>
          <button
            onClick={() => showToast("Training reminder dispatched to Rahul Verma.")}
            className="self-end sm:self-auto px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs border border-rose-200 transition-colors cursor-pointer shrink-0"
          >
            Nudge Employee
          </button>
        </div>

        {/* Row 3: SOP Awaiting Approval */}
        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-100/60 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">SOPs Awaiting Approval</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  1 Draft
                </span>
              </div>
              <p className="text-[11px] text-slate-500">SOP-HVC-002 Basement HVAC Ducting & Fire Damper Compliance</p>
            </div>
          </div>
          <button
            onClick={() => setSelectedSopModal(true)}
            className="self-end sm:self-auto px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shrink-0"
          >
            Review SOP
          </button>
        </div>

        {/* Row 4: Unanswered Technical Q&A */}
        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-100/60 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 flex items-center justify-center shrink-0">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">Unanswered Employee Q&A</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-50 text-sky-800 border border-sky-200">
                  1 Question
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Arjun Patel: "D5 PBR fabric roughness map offset calibration for luxury velvet upholstery?"</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('knowledge-base')}
            className="self-end sm:self-auto px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-xl text-xs border border-slate-200 transition-colors cursor-pointer shrink-0"
          >
            Answer Question
          </button>
        </div>
      </div>
    </div>
  );
};
