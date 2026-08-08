import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ProjectBudgetType, ProjectStatus } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { QuickAddClientModal } from '../common/QuickAddClientModal';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose }) => {
  const { clients, addProject } = useBooks();

  const [code, setCode] = useState(`PRJ-${Math.floor(100 + Math.random() * 900)}`);
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('Active');
  const [budgetType, setBudgetType] = useState<ProjectBudgetType>('Fixed Cost');
  const [totalBudget, setTotalBudget] = useState('50000');
  const [hourlyRate, setHourlyRate] = useState('150');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [manager, setManager] = useState('');

  const [isQuickClientOpen, setIsQuickClientOpen] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !clientId) return;

    const selectedClient = clients.find((c) => c.id === clientId);

    addProject({
      code,
      name,
      clientId,
      clientName: selectedClient?.name || 'Client',
      description,
      status,
      budgetType,
      totalBudget: Number(totalBudget) || 0,
      hourlyRate: Number(hourlyRate) || 0,
      startDate,
      manager: manager || 'Project Manager',
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
            Create New Firm Project
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Project Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono font-bold text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-slate-600 dark:text-slate-300 font-medium">
                  Client
                </label>
                <button
                  type="button"
                  onClick={() => setIsQuickClientOpen(true)}
                  className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline text-[11px] flex items-center space-x-0.5 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Client</span>
                </button>
              </div>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.companyName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Enterprise Cloud Migration & Security Audit"
              required
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Scope, deliverables, key milestones..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Budget Type
              </label>
              <select
                value={budgetType}
                onChange={(e) => setBudgetType(e.target.value as ProjectBudgetType)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              >
                <option value="Fixed Cost">Fixed Cost</option>
                <option value="Time & Materials">Time & Materials</option>
                <option value="Task Hours">Task Hours</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Budget Amount ($)
              </label>
              <input
                type="number"
                value={totalBudget}
                onChange={(e) => setTotalBudget(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Hourly Billing Rate ($)
              </label>
              <input
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              >
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
              Project Manager / Lead
            </label>
            <input
              type="text"
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              placeholder="e.g. Sarah Jenkins"
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
              Save Project
            </button>
          </div>
        </form>
      </div>

      <QuickAddClientModal
        isOpen={isQuickClientOpen}
        onClose={() => setIsQuickClientOpen(false)}
        onClientCreated={(newCli) => {
          setClientId(newCli.id);
        }}
      />
    </div>
  );
};
