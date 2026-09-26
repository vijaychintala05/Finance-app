import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { apiClient } from '../../api/client';
import { TimeEntry } from '../../types';
import { isUncertainMutationOutcome } from '../../utils/operationNotice';
import { QuickAddProjectModal } from '../common/QuickAddProjectModal';

const pendingTimeEntryCreateKey = 'firmbooks_pending_time_entry_create';
const committedTimeEntryReceiptKey = 'firmbooks_committed_time_entry_receipt';
type TimeEntryCreatePayload = Omit<TimeEntry, 'id'>;
type PendingTimeEntryCreate = { payload: TimeEntryCreatePayload; organizationId: string; idempotencyKey?: string; status: 'pending' | 'retryable' | 'verify_only'; requestId?: string; source?: 'modal' | 'dashboard' };
const readPendingTimeEntryCreate = (): PendingTimeEntryCreate | null => {
  try {
    const value = sessionStorage.getItem(pendingTimeEntryCreateKey);
    if (!value) return null;
    return JSON.parse(value) as PendingTimeEntryCreate;
  } catch { return null; }
};
const readCommittedTimeEntryReceipt = (): { id: string; requestId?: string; organizationId: string } | null => {
  try {
    const value = sessionStorage.getItem(committedTimeEntryReceiptKey);
    return value ? JSON.parse(value) : null;
  } catch { return null; }
};
interface LogTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProjectId?: string;
  editingTimeEntry?: TimeEntry | null;
}

export const LogTimeModal: React.FC<LogTimeModalProps> = ({
  isOpen,
  onClose,
  defaultProjectId,
  editingTimeEntry,
}) => {
  const { currentOrg, projects, clients, timeEntries, addTimeEntry, updateTimeEntry, getTimeEntryCreateOperationStatus } = useBooks();
  const selectableProjects = projects.filter((project) => !project.archivedAt || project.id === editingTimeEntry?.projectId);

  const [projectId, setProjectId] = useState(defaultProjectId || selectableProjects[0]?.id || '');
  const [isQuickProjectOpen, setIsQuickProjectOpen] = useState(false);
  const [staffName, setStaffName] = useState('Sarah Jenkins');
  const [taskName, setTaskName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [hours, setHours] = useState('8');
  const [hourlyRate, setHourlyRate] = useState('150');
  const [isBillable, setIsBillable] = useState(true);
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [retrySnapshot, setRetrySnapshot] = useState<PendingTimeEntryCreate | null>(() => readPendingTimeEntryCreate());
  const [saveReceipt, setSaveReceipt] = useState<{ tone: 'warning' | 'error'; message: string; uncertain?: boolean; retryBlocked?: boolean } | null>(() => {
    const pending = readPendingTimeEntryCreate();
    if (pending) return { tone: 'error', uncertain: true, retryBlocked: true, message: 'A prior time-entry save is unresolved. Verify Time Logs before starting another entry.' };
    const committed = readCommittedTimeEntryReceipt();
    if (committed) return { tone: 'warning', message: `Time entry ${committed.id} was committed, but its list refresh failed. Verify it in Time Logs before continuing.` };
    return null;
  });
  const [committedReceipt, setCommittedReceipt] = useState<{ id: string; requestId?: string; organizationId: string } | null>(() => readCommittedTimeEntryReceipt());

  // Extract unique staff list for easy auto-complete suggestions
  const existingStaff = Array.from(
    new Set(timeEntries.map((t) => t.staffName).filter(Boolean))
  );

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    if (committedReceipt) {
      void apiClient.get<any[]>('/finance/time-entries', committedReceipt.organizationId).then((response) => {
        if (cancelled || response.error || !Array.isArray(response.data)) return;
        if (response.data.some((entry) => entry.id === committedReceipt.id)) {
          sessionStorage.removeItem(committedTimeEntryReceiptKey);
          setCommittedReceipt(null);
          setSaveReceipt((current) => current?.tone === 'warning' ? null : current);
        }
      }).catch(() => undefined);
    }
    if (retrySnapshot && saveReceipt?.retryBlocked && retrySnapshot.idempotencyKey && retrySnapshot.status !== 'verify_only') {
      void getTimeEntryCreateOperationStatus(retrySnapshot.idempotencyKey, retrySnapshot.organizationId).then((response) => {
        if (cancelled || !response) return;
        if (!response.error && response.data?.state === 'COMPLETED' && response.data.responseStatus === 201 && response.data.entryId) {
          const receipt = { id: response.data.entryId, organizationId: retrySnapshot.organizationId };
          sessionStorage.removeItem(pendingTimeEntryCreateKey);
          sessionStorage.setItem(committedTimeEntryReceiptKey, JSON.stringify(receipt));
          setRetrySnapshot(null);
          setCommittedReceipt(receipt);
          setSaveReceipt({ tone: 'warning', message: `Time entry ${receipt.id} was confirmed by the server operation receipt.` });
          return;
        }
        setSaveReceipt((current) => current?.uncertain ? { ...current, retryBlocked: false } : current);
      }).catch(() => {
        if (!cancelled) setSaveReceipt((current) => current?.uncertain ? { ...current, retryBlocked: false } : current);
      });
    }
    return () => { cancelled = true; };
  }, [isOpen, committedReceipt, retrySnapshot, saveReceipt?.retryBlocked, getTimeEntryCreateOperationStatus]);
  if (!isOpen) return null;

  const editingArchivedProject = Boolean(editingTimeEntry && projects.find((project) => project.id === editingTimeEntry.projectId)?.archivedAt);

  const handleProjectChange = (id: string) => {
    setProjectId(id);
    const prj = projects.find((p) => p.id === id);
    if (prj && prj.hourlyRate) {
      setHourlyRate(String(prj.hourlyRate));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const retry = Boolean(!editingTimeEntry && saveReceipt?.uncertain && retrySnapshot && !saveReceipt.retryBlocked);
    if (isSaving || saveReceipt?.retryBlocked || (saveReceipt?.tone === 'warning' && !saveReceipt.uncertain) || (!retry && (!projectId || !taskName || !hours))) return;
    const requestOrganizationId = retry ? retrySnapshot!.organizationId : currentOrg.id;
    let operationSnapshot: PendingTimeEntryCreate | null = retry ? retrySnapshot : null;
    const prj = projects.find((p) => p.id === projectId);
    const cli = clients.find((c) => c.id === prj?.clientId);
    setIsSaving(true);
    setSaveReceipt(null);
    try {
      if (editingTimeEntry) {
        const saved = await updateTimeEntry(editingTimeEntry.id, {
          projectId, projectName: prj?.name || 'Project', clientName: cli?.name || 'Client', staffName, taskName, date,
          hours: Number(hours), hourlyRate: Number(hourlyRate), isBillable, description,
        });
        if (saved) onClose();
        return;
      }
      const payload: TimeEntryCreatePayload = retry ? retrySnapshot!.payload : {
        projectId, projectName: prj?.name || 'Project', clientName: cli?.name || 'Client', staffName, taskName, date,
        hours: Number(hours), hourlyRate: Number(hourlyRate), isBillable, isBilled: false, description,
      };
      const operation: PendingTimeEntryCreate = retry ? retrySnapshot! : {
        payload, organizationId: requestOrganizationId, idempotencyKey: apiClient.createIdempotencyKey(), status: 'pending', source: 'modal',
      };
      operationSnapshot = operation;
      if (!retry) sessionStorage.setItem(pendingTimeEntryCreateKey, JSON.stringify(operation));
      setRetrySnapshot(operation);
      const saved = await addTimeEntry(payload, requestOrganizationId, operation.idempotencyKey);
      sessionStorage.removeItem(pendingTimeEntryCreateKey);
      setRetrySnapshot(null);
      if (saved.refreshFailed) {
        const receipt = { id: saved.data.id, requestId: saved.requestId, organizationId: requestOrganizationId };
        sessionStorage.setItem(committedTimeEntryReceiptKey, JSON.stringify(receipt));
        setCommittedReceipt(receipt);
        setSaveReceipt({ tone: 'warning', message: `Time entry ${saved.data.id} was saved, but the list could not be refreshed. Verify it in Time Logs before continuing. Request ID: ${saved.requestId || 'not provided'}` });
        return;
      }
      sessionStorage.removeItem(committedTimeEntryReceiptKey);
      setCommittedReceipt(null);
      onClose();
    } catch (error: any) {
      const response = error?.response;
      const malformedSuccess = response?.status >= 200 && response?.status < 300;
      const uncertain = malformedSuccess || Boolean(response && (response.retryable || response.status === 0 || isUncertainMutationOutcome(response)));
      const retryBlocked = malformedSuccess || !response;
      if (uncertain && !editingTimeEntry && operationSnapshot) {
        const operation: PendingTimeEntryCreate = { ...operationSnapshot, status: retryBlocked ? 'verify_only' : 'retryable', requestId: response?.requestId, source: 'modal' };
        sessionStorage.setItem(pendingTimeEntryCreateKey, JSON.stringify(operation));
        setRetrySnapshot(operation);
      } else if (!uncertain) {
        sessionStorage.removeItem(pendingTimeEntryCreateKey);
        setRetrySnapshot(null);
      }
      const message = malformedSuccess
        ? 'The server returned success without an entry ID. Do not retry; verify the entry in Time Logs.'
        : uncertain
          ? 'The save outcome is uncertain. Retry only the exact same entry in this session; do not edit its fields.'
          : `${error?.message || 'The time entry could not be saved.'} Correct the issue and try again.`;
      setSaveReceipt({ tone: 'error', uncertain, retryBlocked, message: response?.requestId ? `${message} Request ID: ${response.requestId}` : message });
    } finally {
      setIsSaving(false);
    }
  };
  const handleStartAnotherEntry = () => {
    setSaveReceipt(null);
    setProjectId(defaultProjectId || selectableProjects[0]?.id || '');
    setTaskName('');
    setDate(new Date().toISOString().split('T')[0]);
    setHours('8');
    setDescription('');
    setIsBillable(true);
  };
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
            {editingTimeEntry ? 'Edit Time Log Entry' : 'Log Project Time Entry'}
          </h3>
          <button onClick={onClose} disabled={isSaving || (saveReceipt?.uncertain && !saveReceipt.retryBlocked)} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {committedReceipt && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">Time entry {committedReceipt.id} was committed, but its list refresh failed. Verify it in Time Logs before continuing. {committedReceipt.requestId && `Request ID: ${committedReceipt.requestId}`} {saveReceipt?.tone === 'warning' && <button type="button" className="ml-2 underline" onClick={handleStartAnotherEntry}>Start another entry</button>}</div>}
          {saveReceipt?.tone === 'error' && <div role={saveReceipt.tone === 'error' ? 'alert' : 'status'} aria-live={saveReceipt.tone === 'error' ? 'assertive' : 'polite'} className={`rounded-lg border p-3 ${saveReceipt.tone === 'error' ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>{saveReceipt.message}</div>}
          <fieldset disabled={isSaving || saveReceipt?.tone === 'warning' || saveReceipt?.uncertain} className="space-y-4 disabled:opacity-80">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-slate-600 dark:text-slate-300 font-medium">
                Select Project
              </label>
              <button
                type="button"
                onClick={() => setIsQuickProjectOpen(true)}
                className="text-blue-600 dark:text-blue-400 font-bold hover:underline text-[11px] flex items-center space-x-0.5 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>New Project</span>
              </button>
            </div>
            <select
              value={projectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              required
              disabled={editingArchivedProject}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
            >
              {selectableProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.code}] {p.name}
                </option>
              ))}
            </select>
          </div>

          {editingArchivedProject && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">This project is archived. You can correct the task text or description, while project, date, hours, billing state, and rate remain locked.</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Staff / Consultant Name
              </label>
              <input
                type="text"
                list="staff-list-options"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
              <datalist id="staff-list-options">
                {existingStaff.map((staff) => (
                  <option key={staff} value={staff} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={editingArchivedProject}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
              Task Name / Service
            </label>
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="e.g., FHIR API Security Audit & Testing"
              required
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Logged Hours
              </label>
              <input
                type="number"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                disabled={editingArchivedProject}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Hourly Rate ($)
              </label>
              <input
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                disabled={editingArchivedProject}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <input
              type="checkbox"
              id="billableCheck"
              checked={isBillable}
              onChange={(e) => setIsBillable(e.target.checked)}
              disabled={editingArchivedProject}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <label
              htmlFor="billableCheck"
              className="text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
            >
              Billable to Client ({isBillable ? `$${Number(hours) * Number(hourlyRate)}` : 'Non-billable'})
            </label>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
              Description / Notes
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Detailed work performed..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
            />
          </div>

          </fieldset>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
            <button
              type="button"
              disabled={isSaving || saveReceipt?.tone === 'warning' || saveReceipt?.uncertain}
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || saveReceipt?.tone === 'warning' || saveReceipt?.retryBlocked}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : saveReceipt?.tone === 'warning' ? 'Saved — close' : saveReceipt?.retryBlocked ? 'Verify in Time Logs' : saveReceipt?.uncertain ? 'Retry same entry' : editingTimeEntry ? 'Update Entry' : 'Log Time'}
            </button>
          </div>
        </form>
      </div>

      <QuickAddProjectModal
        isOpen={isQuickProjectOpen}
        onClose={() => setIsQuickProjectOpen(false)}
        onProjectCreated={(newPrj) => {
          handleProjectChange(newPrj.id);
        }}
      />
    </div>
  );
};
