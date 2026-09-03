import React from 'react';
import { 
  X, 
  CheckCircle2, 
  FileSignature, 
  FileText, 
  AlertCircle, 
  ShieldCheck, 
  Calendar, 
  Clock, 
  FileCheck, 
  AlertTriangle, 
  Wrench, 
  Filter 
} from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';

// Helper Icon Component for Needs Attention
function AlertOctagon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

const formatDueDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
});

const getDaysOverdue = (dateString: string) => {
  const dueDate = new Date(dateString);
  dueDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000));
};

export const DashboardModals: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const {
    toastMessage,
    setToastMessage,
    selectedReviewItem,
    setSelectedReviewItem,
    handleRequestRevisions,
    handleApproveReview,
    selectedAttentionAlert,
    setSelectedAttentionAlert,
    handleResolveAlert,
    selectedSopModal,
    setSelectedSopModal,
    showToast,
    isSiteIssueModalOpen,
    setIsSiteIssueModalOpen,
    newSiteIssue,
    setNewSiteIssue,
    handleCreateSiteIssue,
    projects,
    isMeetingModalOpen,
    setIsMeetingModalOpen,
    newMeeting,
    setNewMeeting,
    handleCreateMeeting,
    activeKpiDrawer,
    setActiveKpiDrawer,
    filteredTasks,
    reviewQueue,
    siteIssues,
    setSiteIssues,
    showAllAttentionModal,
    setShowAllAttentionModal,
    attentionAlerts,
    showAllReviewsModal,
    setShowAllReviewsModal,
    isMobileFilterOpen,
    setIsMobileFilterOpen,
    dateRangeFilter,
    setDateRangeFilter,
    selectedProjectFilter,
    setSelectedProjectFilter,
    selectedTeamFilter,
    setSelectedTeamFilter
  } = dashboard;

  const overdueTasks = filteredTasks.filter(task => {
    const dueDate = new Date(task.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return task.status !== 'Completed' && task.status !== 'Approved' && dueDate < today;
  });

  return (
    <>
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MODAL: DETAIL REVIEW RECORD */}
      {selectedReviewItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileSignature className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base sm:text-lg">Drawing Review & Sign-Off Record</h3>
              </div>
              <button onClick={() => setSelectedReviewItem(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wide bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {selectedReviewItem.fileType}
                  </span>
                  <span className="text-xs font-bold text-slate-500">{selectedReviewItem.correctionCycle}</span>
                </div>
                <h4 className="text-sm font-extrabold text-slate-900">{selectedReviewItem.drawingName}</h4>
                <p className="text-xs text-slate-600">Project: <strong className="text-slate-900">{selectedReviewItem.projectName}</strong></p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-white p-3 rounded-2xl border border-slate-200 font-medium">
                <div>Submitter: <strong className="text-slate-900 block">{selectedReviewItem.submittedBy}</strong></div>
                <div>Submission Time: <span className="text-slate-600 block">{selectedReviewItem.submissionTime}</span></div>
                <div>Review Due: <span className="text-rose-700 font-bold block">{selectedReviewItem.reviewDueDate}</span></div>
                <div>Priority: <span className="font-bold text-amber-800 block">{selectedReviewItem.priority}</span></div>
              </div>

              {selectedReviewItem.notes && (
                <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200/80 text-xs text-amber-900 space-y-1">
                  <span className="font-bold block">Submitter Notes:</span>
                  <p>{selectedReviewItem.notes}</p>
                </div>
              )}

              <div className="p-4 bg-slate-900 text-white rounded-2xl text-center space-y-2">
                <FileText className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-xs font-bold">{selectedReviewItem.drawingName}</p>
                <p className="text-[10px] text-slate-400">PDF / DWG preview loaded in technical viewer</p>
              </div>
            </div>

            <div className="pt-3 flex flex-col sm:flex-row justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleRequestRevisions(selectedReviewItem.id)}
                className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs border border-rose-200 cursor-pointer"
              >
                Request Revisions
              </button>
              <button
                type="button"
                onClick={() => handleApproveReview(selectedReviewItem.id)}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-xl text-xs shadow-2xs cursor-pointer"
              >
                Approve Drawing ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETAIL ATTENTION ALERT RECORD */}
      {selectedAttentionAlert && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-base">Operational Alert Record</h3>
              </div>
              <button onClick={() => setSelectedAttentionAlert(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                  {selectedAttentionAlert.type}
                </span>
                <span className="text-slate-400">{selectedAttentionAlert.timestamp}</span>
              </div>

              <h4 className="text-sm font-extrabold text-slate-900">{selectedAttentionAlert.title}</h4>
              
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
                <div>Project: <strong className="text-slate-900">{selectedAttentionAlert.projectName}</strong></div>
                {selectedAttentionAlert.owner && <div>Owner / Lead: <strong>{selectedAttentionAlert.owner}</strong></div>}
                {selectedAttentionAlert.dueDate && <div>Due Date: <strong className="text-rose-600">{selectedAttentionAlert.dueDate}</strong></div>}
              </div>

              <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-2xl border border-slate-200">
                {selectedAttentionAlert.detail}
              </p>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedAttentionAlert(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => handleResolveAlert(selectedAttentionAlert.id, selectedAttentionAlert.title)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-2xs cursor-pointer"
              >
                Resolve & Close Alert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SOP REVIEW RECORD */}
      {selectedSopModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">SOP Review & Approval</h3>
              </div>
              <button onClick={() => setSelectedSopModal(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                <span className="font-bold text-emerald-800 text-[10px] uppercase bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Draft SOP</span>
                <h4 className="font-extrabold text-slate-900 text-sm">SOP-HVC-002: Basement HVAC Ducting & Fire Damper Compliance</h4>
                <p className="text-slate-500">Drafted by MEP Consultant & Site Lead</p>
              </div>
              <p className="leading-relaxed">
                Covers structural sleeve clearances, fire damper positioning at fire barrier walls, and pressure test protocols before False Ceiling framing installation.
              </p>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedSopModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setSelectedSopModal(false);
                  showToast("SOP-HVC-002 approved & published firm-wide!");
                }}
                className="px-4 py-2 bg-emerald-500 text-slate-950 font-extrabold rounded-xl text-xs shadow-2xs cursor-pointer"
              >
                Approve SOP ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD SITE ISSUE */}
      {isSiteIssueModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-slate-900 text-lg">Log New Site Issue</h3>
              </div>
              <button onClick={() => setIsSiteIssueModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSiteIssue} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Select Project</label>
                <select
                  value={newSiteIssue.projectId}
                  onChange={(e) => setNewSiteIssue({ ...newSiteIssue, projectId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Issue Title / Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Plumb misalignment in 2nd floor wall masonry"
                  value={newSiteIssue.title}
                  onChange={(e) => setNewSiteIssue({ ...newSiteIssue, title: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Location on Site</label>
                <input
                  type="text"
                  placeholder="e.g. Master Bedroom Wall B"
                  value={newSiteIssue.location}
                  onChange={(e) => setNewSiteIssue({ ...newSiteIssue, location: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                  <select
                    value={newSiteIssue.category}
                    onChange={(e) => setNewSiteIssue({ ...newSiteIssue, category: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    <option value="Masonry">Masonry</option>
                    <option value="Waterproofing">Waterproofing</option>
                    <option value="Electrical">Electrical</option>
                    <option value="Plumbing">Plumbing</option>
                    <option value="Finishes">Finishes</option>
                    <option value="Structure">Structure</option>
                    <option value="Dimensions">Dimensions</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Severity</label>
                  <select
                    value={newSiteIssue.severity}
                    onChange={(e) => setNewSiteIssue({ ...newSiteIssue, severity: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSiteIssueModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-full text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-full text-xs shadow-2xs"
                >
                  Log Site Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SCHEDULE MEETING */}
      {isMeetingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-lg">Schedule Operation Meeting</h3>
              </div>
              <button onClick={() => setIsMeetingModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMeeting} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Meeting Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Greenwood Kitchen Design Review with Client"
                  value={newMeeting.title}
                  onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Project</label>
                  <select
                    value={newMeeting.project}
                    onChange={(e) => setNewMeeting({ ...newMeeting, project: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Time</label>
                  <input
                    type="text"
                    value={newMeeting.time}
                    onChange={(e) => setNewMeeting({ ...newMeeting, time: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Location / Mode</label>
                <input
                  type="text"
                  value={newMeeting.location}
                  onChange={(e) => setNewMeeting({ ...newMeeting, location: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMeetingModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-full text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-full text-xs shadow-2xs"
                >
                  Confirm Meeting
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER MODAL: INTERACTIVE KPI DETAILS */}
      {activeKpiDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-end">
          <div className="bg-white h-full w-full max-w-md p-6 overflow-y-auto shadow-2xl space-y-4 animate-in slide-in-from-right duration-200 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  {activeKpiDrawer === 'overdue' && <Clock className="w-5 h-5 text-rose-600" />}
                  {activeKpiDrawer === 'reviews' && <FileCheck className="w-5 h-5 text-amber-600" />}
                  {activeKpiDrawer === 'blocked' && <AlertTriangle className="w-5 h-5 text-rose-600" />}
                  {activeKpiDrawer === 'issues' && <Wrench className="w-5 h-5 text-sky-600" />}
                  <h3 className="font-bold text-slate-900 text-base uppercase tracking-wide">
                    {activeKpiDrawer === 'overdue' && 'Overdue Tasks List'}
                    {activeKpiDrawer === 'reviews' && 'Pending Review Queue'}
                    {activeKpiDrawer === 'blocked' && 'Blocked Tasks Breakdown'}
                    {activeKpiDrawer === 'issues' && 'Open Site Snags & Issues'}
                  </h3>
                </div>
                <button onClick={() => setActiveKpiDrawer(null)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                {activeKpiDrawer === 'overdue' && (
                  overdueTasks.length > 0 ? overdueTasks.map(task => (
                    <div key={task.id} className="p-3 bg-rose-50 rounded-2xl border border-rose-200/80 space-y-1">
                      <div className="font-bold text-xs text-rose-900">{task.title}</div>
                      <div className="text-[10px] text-rose-700">{task.projectName} • Assigned to {task.assignedTo}</div>
                      <div className="text-[10px] font-semibold text-rose-600">
                        Overdue by {getDaysOverdue(task.dueDate)} days • Due {formatDueDate(task.dueDate)}
                      </div>
                      <button
                        onClick={() => {
                          showToast('Reminder sent to assignee.');
                          setActiveKpiDrawer(null);
                        }}
                        className="mt-2 px-3 py-1 bg-rose-600 text-white text-[10px] font-bold rounded-lg cursor-pointer"
                      >
                        Nudge Assignee
                      </button>
                    </div>
                  )) : (
                    <div className="p-4 text-center text-xs text-slate-500">No overdue tasks.</div>
                  )
                )}

                {activeKpiDrawer === 'reviews' && (
                  reviewQueue.map(r => (
                    <div key={r.id} className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 space-y-1.5">
                      <div className="font-bold text-xs text-amber-900">{r.drawingName}</div>
                      <div className="text-[10px] text-amber-800">{r.projectName} • {r.submittedBy}</div>
                      <button 
                        onClick={() => {
                          setActiveKpiDrawer(null);
                          setSelectedReviewItem(r);
                        }}
                        className="mt-2 px-3 py-1 bg-slate-900 text-white font-bold text-[10px] rounded-lg cursor-pointer"
                      >
                        Open Review Screen
                      </button>
                    </div>
                  ))
                )}

                {activeKpiDrawer === 'blocked' && (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                    <div className="font-bold text-xs text-slate-900">Structural Grid Alignment Drawing</div>
                    <div className="text-[10px] text-slate-500">Blocked by: Waiting on Structural Consultant Column Grid coordinates</div>
                    <button 
                      onClick={() => {
                        showToast("Dependency unblocked manually.");
                        setActiveKpiDrawer(null);
                      }}
                      className="mt-2 px-3 py-1 bg-slate-900 text-white font-bold text-[10px] rounded-lg cursor-pointer"
                    >
                      Unblock Dependency
                    </button>
                  </div>
                )}

                {activeKpiDrawer === 'issues' && (
                  siteIssues.map(s => (
                    <div key={s.id} className="p-3 bg-sky-50 rounded-2xl border border-sky-200 space-y-1">
                      <div className="font-bold text-xs text-sky-900">{s.title}</div>
                      <div className="text-[10px] text-sky-700">{s.projectName} • {s.location}</div>
                      <div className="text-[10px] text-sky-600 font-semibold">Assigned: {s.assignedTo}</div>
                      <button 
                        onClick={() => {
                          setSiteIssues(prev => prev.map(item => item.id === s.id ? { ...item, status: 'Resolved' } : item));
                          showToast(`Issue ${s.id} marked resolved.`);
                        }}
                        className="mt-2 px-3 py-1 bg-slate-900 text-white font-bold text-[10px] rounded-lg cursor-pointer"
                      >
                        Inspect Issue
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <button
              onClick={() => setActiveKpiDrawer(null)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs cursor-pointer mt-4"
            >
              Close Drawer
            </button>
          </div>
        </div>
      )}

      {/* MODAL: SHOW ALL ATTENTION ALERTS */}
      {showAllAttentionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-lg">All Operational Attention Items ({attentionAlerts.length})</h3>
              </div>
              <button onClick={() => setShowAllAttentionModal(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {attentionAlerts.map(alert => (
                <div key={alert.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">{alert.type}</span>
                      <span className="text-slate-500 font-bold">{alert.projectName}</span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">{alert.title}</h4>
                    <p className="text-[11px] text-slate-600">{alert.detail}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowAllAttentionModal(false);
                      setSelectedAttentionAlert(alert);
                    }}
                    className="px-3.5 py-1.5 bg-slate-900 text-white font-bold rounded-xl text-xs shrink-0 cursor-pointer"
                  >
                    {alert.actionText || 'View'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SHOW ALL REVIEWS */}
      {showAllReviewsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-lg">Full Review Queue ({reviewQueue.length})</h3>
              </div>
              <button onClick={() => setShowAllReviewsModal(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {reviewQueue.map(item => (
                <div key={item.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">{item.status}</span>
                      <span className="text-slate-500">{item.projectName}</span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">{item.drawingName}</h4>
                    <p className="text-[11px] text-slate-500">Submitted by {item.submittedBy} • {item.submissionTime}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowAllReviewsModal(false);
                      setSelectedReviewItem(item);
                    }}
                    className="px-3.5 py-1.5 bg-slate-900 text-white font-bold rounded-xl text-xs shrink-0 cursor-pointer"
                  >
                    Open Review
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET FOR MOBILE FILTERS */}
      {isMobileFilterOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end">
          <div className="bg-white rounded-t-3xl p-6 w-full shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Dashboard Operational Filters</h3>
              </div>
              <button onClick={() => setIsMobileFilterOpen(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Date Range</label>
                <select
                  value={dateRangeFilter}
                  onChange={(e) => setDateRangeFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold"
                >
                  <option value="Today">Today</option>
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                  <option value="Q3 2026">Q3 2026</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Project</label>
                <select
                  value={selectedProjectFilter}
                  onChange={(e) => setSelectedProjectFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold"
                >
                  <option value="All">All Projects</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Team / Department</label>
                <select
                  value={selectedTeamFilter}
                  onChange={(e) => setSelectedTeamFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold"
                >
                  <option value="All">All Teams</option>
                  <option value="Design">Design Studio</option>
                  <option value="Site / Execution">Site & Execution</option>
                  <option value="3D & Visuals">3D Visuals</option>
                  <option value="QA">QA / Compliance</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => setIsMobileFilterOpen(false)}
              className="w-full py-3 bg-emerald-500 text-slate-950 font-extrabold rounded-2xl text-xs cursor-pointer shadow-2xs"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </>
  );
};
