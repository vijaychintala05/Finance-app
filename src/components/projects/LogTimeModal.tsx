import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { TimeEntry } from '../../types';
import { QuickAddProjectModal } from '../common/QuickAddProjectModal';

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
  const { projects, clients, timeEntries, addTimeEntry, updateTimeEntry } = useBooks();

  const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || '');
  const [isQuickProjectOpen, setIsQuickProjectOpen] = useState(false);
  const [staffName, setStaffName] = useState('Sarah Jenkins');
  const [taskName, setTaskName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [hours, setHours] = useState('8');
  const [hourlyRate, setHourlyRate] = useState('150');
  const [isBillable, setIsBillable] = useState(true);
  const [description, setDescription] = useState('');

  // Extract unique staff list for easy auto-complete suggestions
  const existingStaff = Array.from(
    new Set(timeEntries.map((t) => t.staffName).filter(Boolean))
  );

  useEffect(() => {
    if (isOpen) {
      if (editingTimeEntry) {
        setProjectId(editingTimeEntry.projectId);
        setStaffName(editingTimeEntry.staffName);
        setTaskName(editingTimeEntry.taskName);
        setDate(editingTimeEntry.date);
        setHours(String(editingTimeEntry.hours));
        setHourlyRate(String(editingTimeEntry.hourlyRate));
        setIsBillable(editingTimeEntry.isBillable);
        setDescription(editingTimeEntry.description || '');
      } else {
        const activeProjectId = defaultProjectId || projects[0]?.id || '';
        setProjectId(activeProjectId);
        const prj = projects.find((p) => p.id === activeProjectId);
        setHourlyRate(prj?.hourlyRate ? String(prj.hourlyRate) : '150');
        setStaffName(existingStaff[0] || 'Sarah Jenkins');
        setTaskName('');
        setDate(new Date().toISOString().split('T')[0]);
        setHours('8');
        setIsBillable(true);
        setDescription('');
      }
    }
  }, [isOpen, editingTimeEntry, defaultProjectId]);

  if (!isOpen) return null;

  const handleProjectChange = (id: string) => {
    setProjectId(id);
    const prj = projects.find((p) => p.id === id);
    if (prj && prj.hourlyRate) {
      setHourlyRate(String(prj.hourlyRate));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !taskName || !hours) return;

    const prj = projects.find((p) => p.id === projectId);
    const cli = clients.find((c) => c.id === prj?.clientId);

    if (editingTimeEntry) {
      updateTimeEntry(editingTimeEntry.id, {
        projectId,
        projectName: prj?.name || 'Project',
        clientName: cli?.name || 'Client',
        staffName,
        taskName,
        date,
        hours: Number(hours),
        hourlyRate: Number(hourlyRate),
        isBillable,
        description,
      });
    } else {
      addTimeEntry({
        projectId,
        projectName: prj?.name || 'Project',
        clientName: cli?.name || 'Client',
        staffName,
        taskName,
        date,
        hours: Number(hours),
        hourlyRate: Number(hourlyRate),
        isBillable,
        isBilled: false,
        description,
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
            {editingTimeEntry ? 'Edit Time Log Entry' : 'Log Project Time Entry'}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
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
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.code}] {p.name}
                </option>
              ))}
            </select>
          </div>

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

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold shadow-sm cursor-pointer"
            >
              {editingTimeEntry ? 'Update Entry' : 'Log Time'}
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
