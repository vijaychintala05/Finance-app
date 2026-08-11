import React, { useState } from 'react';
import { X, FolderPlus, Plus, Loader2, AlertCircle } from 'lucide-react';
import { ProjectBudgetType, ProjectStatus } from '../../types';
import { customerApi } from '../../services/customerApi';
import { QuickAddClientModal } from './QuickAddClientModal';

interface ClientItem {
  id: string;
  name?: string;
  displayName?: string;
  companyName?: string;
}

interface QuickAddProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (project: any) => void;
  defaultClientId?: string;
  clients?: ClientItem[];
}

export const QuickAddProjectModal: React.FC<QuickAddProjectModalProps> = ({
  isOpen,
  onClose,
  onProjectCreated,
  defaultClientId,
  clients = [],
}) => {
  const [code, setCode] = useState(`PRJ-${Math.floor(100 + Math.random() * 900)}`);
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState(defaultClientId || clients[0]?.id || '');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('Active');
  const [budgetType, setBudgetType] = useState<ProjectBudgetType>('Fixed Cost');
  const [totalBudget, setTotalBudget] = useState('25000');
  const [hourlyRate, setHourlyRate] = useState('150');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isQuickClientOpen, setIsQuickClientOpen] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;

    setLoading(true);
    setError(null);

    const selectedClient = clients.find((c) => c.id === clientId);

    try {
      const created = await customerApi.createProject({
        code: code.trim(),
        name: name.trim(),
        clientId: clientId || undefined,
        customerId: clientId || undefined,
        clientName: selectedClient?.displayName || selectedClient?.companyName || selectedClient?.name || '',
        description: description.trim(),
        budgetType,
        totalBudget: Number(totalBudget) || 0,
        hourlyRate: Number(hourlyRate) || 0,
        manager: 'Project Manager',
      });

      onProjectCreated(created);
      setName('');
      setDescription('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create project on server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center space-x-2">
            <FolderPlus className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              Quick Add Project
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Project Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Project Title / Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Website Redesign & SEO"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-slate-600 dark:text-slate-300 font-medium">
                Client *
              </label>
              <button
                type="button"
                onClick={() => setIsQuickClientOpen(true)}
                className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline flex items-center space-x-0.5 cursor-pointer text-[11px]"
              >
                <Plus className="w-3 h-3" />
                <span>New Client</span>
              </button>
            </div>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName} ({c.name})
                </option>
              ))}
            </select>
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
                <option value="Non-Billable">Non-Billable</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                {budgetType === 'Fixed Cost' ? 'Total Budget Amount' : 'Hourly Rate ($/hr)'}
              </label>
              <input
                type="number"
                value={budgetType === 'Fixed Cost' ? totalBudget : hourlyRate}
                onChange={(e) =>
                  budgetType === 'Fixed Cost'
                    ? setTotalBudget(e.target.value)
                    : setHourlyRate(e.target.value)
                }
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
              Description / Scope
            </label>
            <textarea
              rows={2}
              placeholder="Brief summary of deliverables and milestones..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 resize-none"
            />
          </div>

          <div className="pt-3 flex justify-end space-x-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-xs transition-colors cursor-pointer"
            >
              Save & Select Project
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
