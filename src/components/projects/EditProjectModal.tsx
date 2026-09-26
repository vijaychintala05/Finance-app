import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Project, ProjectBudgetType, ProjectStatus } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { OperationNoticeBanner } from '../common/OperationNoticeBanner';
import { committedButStaleNotice, mutationExceptionNotice, type OperationNotice } from '../../utils/operationNotice';

interface EditProjectModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
}

export const EditProjectModal: React.FC<EditProjectModalProps> = ({ isOpen, project, onClose }) => {
  const { clients, settings, updateProject } = useBooks();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('Active');
  const [budgetType, setBudgetType] = useState<ProjectBudgetType>('Fixed Cost');
  const [totalBudget, setTotalBudget] = useState('0');
  const [hourlyRate, setHourlyRate] = useState('0');
  const [startDate, setStartDate] = useState('');
  const [manager, setManager] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmissionBlocked, setIsSubmissionBlocked] = useState(false);
  const [wasCommitted, setWasCommitted] = useState(false);
  const [notice, setNotice] = useState<OperationNotice | null>(null);

  useEffect(() => {
    if (!isOpen || !project) return;
    setCode(project.code);
    setName(project.name);
    setClientId(project.clientId || '');
    setDescription(project.description || '');
    setStatus(project.status);
    setBudgetType(project.budgetType);
    setTotalBudget(String(project.totalBudget ?? 0));
    setHourlyRate(String(project.hourlyRate ?? 0));
    setStartDate(project.startDate || '');
    setManager(project.manager || '');
    setIsSubmitting(false);
    setIsSubmissionBlocked(false);
    setWasCommitted(false);
    setNotice(null);
  }, [isOpen, project?.id]);

  if (!isOpen || !project) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || isSubmissionBlocked || !name.trim() || !code.trim()) return;

    setIsSubmitting(true);
    setNotice(null);
    try {
      const result = await updateProject(project.id, {
        code: code.trim(),
        name: name.trim(),
        clientId,
        description: description.trim(),
        status,
        budgetType,
        totalBudget: Number(totalBudget),
        hourlyRate: Number(hourlyRate),
        startDate,
        manager: manager.trim(),
      });
      setWasCommitted(true);
      setIsSubmissionBlocked(true);
      setNotice(result.refreshFailed
        ? committedButStaleNotice('Project updated; project list refresh failed', 'The server saved this project, but the latest project data could not be loaded.', result.requestId)
        : {
            tone: 'success',
            title: result.data.changed === false ? 'Project is up to date' : 'Project updated',
            message: result.data.changed === false ? 'No project fields needed changing.' : `${result.data.name} was saved successfully.`,
            requestId: result.requestId,
          });
    } catch (error) {
      const failure = mutationExceptionNotice(error, { action: 'Project update' });
      setNotice(failure);
      if (failure.tone === 'warning') setIsSubmissionBlocked(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="edit-project-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 id="edit-project-title" className="text-sm font-bold text-slate-900 dark:text-white">Edit project</h2>
            <p className="mt-0.5 text-xs text-slate-500">Linked invoices, expenses, and time records keep their original snapshots.</p>
          </div>
          <button type="button" aria-label="Close project editor" onClick={onClose} disabled={isSubmitting || (isSubmissionBlocked && !wasCommitted)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 p-5 text-xs">
          {notice && <OperationNoticeBanner notice={notice} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 font-medium text-slate-600 dark:text-slate-300">
              <span>Project code</span>
              <input value={code} onChange={(event) => setCode(event.target.value)} required maxLength={64} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
            <label className="space-y-1 font-medium text-slate-600 dark:text-slate-300">
              <span>Project name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={255} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
            <label className="space-y-1 font-medium text-slate-600 dark:text-slate-300">
              <span>Customer</span>
              <select value={clientId} onChange={(event) => setClientId(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="">No customer</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.companyName || client.name}</option>)}
              </select>
              <span className="block text-[11px] font-normal text-slate-500">Customer assignment can change only before project records are linked.</span>
            </label>
            <label className="space-y-1 font-medium text-slate-600 dark:text-slate-300">
              <span>Project status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="Active">Active</option><option value="On Hold">On Hold</option><option value="Completed">Completed</option><option value="Cancelled">Cancelled</option>
              </select>
            </label>
            <label className="space-y-1 font-medium text-slate-600 dark:text-slate-300">
              <span>Budget type</span>
              <select value={budgetType} onChange={(event) => setBudgetType(event.target.value as ProjectBudgetType)} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="Fixed Cost">Fixed Cost</option><option value="Time & Materials">Time & Materials</option><option value="Task Hours">Task Hours</option>
              </select>
            </label>
            <label className="space-y-1 font-medium text-slate-600 dark:text-slate-300">
              <span>Total budget ({settings.currencySymbol})</span>
              <input type="number" min="0" step="0.01" value={totalBudget} onChange={(event) => setTotalBudget(event.target.value)} required className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
            <label className="space-y-1 font-medium text-slate-600 dark:text-slate-300">
              <span>Hourly rate ({settings.currencySymbol})</span>
              <input type="number" min="0" step="0.01" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
            <label className="space-y-1 font-medium text-slate-600 dark:text-slate-300">
              <span>Start date</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
            <label className="space-y-1 font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">
              <span>Project manager</span>
              <input value={manager} onChange={(event) => setManager(event.target.value)} maxLength={255} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
            <label className="space-y-1 font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">
              <span>Description</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={10000} rows={4} className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={onClose} disabled={isSubmitting || (isSubmissionBlocked && !wasCommitted)} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">{wasCommitted ? 'Close' : isSubmissionBlocked ? 'Awaiting verification' : 'Cancel'}</button>
            <button type="submit" disabled={isSubmitting || isSubmissionBlocked} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">{isSubmitting ? 'Saving…' : wasCommitted ? 'Project saved' : isSubmissionBlocked ? 'Awaiting verification' : 'Save changes'}</button>
          </div>
        </form>
      </section>
    </div>
  );
};
