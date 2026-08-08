import React, { useState } from 'react';
import {
  Building2,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  FolderKanban,
  GripVertical,
  Landmark,
  LayoutGrid,
  MoveDown,
  MoveUp,
  Plus,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { Project } from '../../types';

export interface WidgetConfig {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  category: 'FINANCIAL' | 'PROJECTS' | 'BANKING' | 'TAX' | 'OPERATIONS';
  isCustom?: boolean;
  config?: {
    selectedProjectId?: string;
  };
}

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  {
    id: 'cash_flow_analysis',
    title: 'Cash Flow Analysis & Trends',
    description: 'Operating cash inflows, outflows, net liquid flow, and monthly trend breakdown',
    enabled: true,
    category: 'FINANCIAL',
  },
  {
    id: 'banking_module',
    title: 'Banking & Cash Overview',
    description: 'Live balances across liquid bank accounts, cash drawers, and corporate credit cards',
    enabled: true,
    category: 'BANKING',
  },
  {
    id: 'top_expenses_pie',
    title: 'Top Expenses Breakdown (Pie Chart)',
    description: 'Visual category breakdown of major operating expenses and vendor costs',
    enabled: true,
    category: 'FINANCIAL',
  },
  {
    id: 'receivables',
    title: 'Accounts Receivable & Aging',
    description: 'Current vs Overdue aging breakdown and collection status',
    enabled: true,
    category: 'FINANCIAL',
  },
  {
    id: 'quick_actions',
    title: 'Quick Action Shortcuts',
    description: 'Fast double-entry creation buttons for Invoices, Expenses, and Customers',
    enabled: true,
    category: 'OPERATIONS',
  },
  {
    id: 'cash_reserves',
    title: 'Operating Cash & Liquid Reserves',
    description: 'Operating bank balance, net profit, and unbilled WIP hours',
    enabled: true,
    category: 'FINANCIAL',
  },
  {
    id: 'selected_project',
    title: 'Project Spotlight Overview',
    description: 'Deep dive into a specific project budget, profit margin, and unbilled time',
    enabled: true,
    category: 'PROJECTS',
    config: {
      selectedProjectId: '',
    },
  },
  {
    id: 'projects_overview',
    title: 'All Projects Performance',
    description: 'Bar ratios comparing invoiced revenue against direct project costs',
    enabled: true,
    category: 'PROJECTS',
  },
  {
    id: 'pnl_chart',
    title: 'Revenue vs Expense Trend',
    description: 'Monthly bar chart comparing gross sales and operating expense',
    enabled: true,
    category: 'FINANCIAL',
  },
  {
    id: 'tax_compliance',
    title: 'Statutory Tax & MSME Compliance',
    description: '45-Day MSME statutory rule alerts, GST liabilities, and TDS logs',
    enabled: true,
    category: 'TAX',
  },
  {
    id: 'recent_invoices',
    title: 'Recent Invoices Ledger',
    description: 'Latest client billing entries and status badges',
    enabled: true,
    category: 'OPERATIONS',
  },
];

interface DashboardCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  widgets: WidgetConfig[];
  onSaveWidgets: (updatedWidgets: WidgetConfig[]) => void;
  projects: Project[];
}

export const DashboardCustomizerModal: React.FC<DashboardCustomizerModalProps> = ({
  isOpen,
  onClose,
  widgets,
  onSaveWidgets,
  projects,
}) => {
  const [localWidgets, setLocalWidgets] = useState<WidgetConfig[]>(widgets);
  const [isAddModuleOpen, setIsAddModuleOpen] = useState(false);

  // Form state for creating custom widget
  const [customTitle, setCustomTitle] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customCategory, setCustomCategory] = useState<'FINANCIAL' | 'PROJECTS' | 'BANKING' | 'TAX' | 'OPERATIONS'>('FINANCIAL');

  React.useEffect(() => {
    setLocalWidgets(widgets);
  }, [widgets]);

  if (!isOpen) return null;

  const handleToggle = (id: string) => {
    setLocalWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w))
    );
  };

  const handleDelete = (id: string) => {
    setLocalWidgets((prev) => prev.filter((w) => w.id !== id));
  };

  const handleMove = (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= localWidgets.length) return;

    const newArr = [...localWidgets];
    const temp = newArr[index];
    newArr[index] = newArr[targetIndex];
    newArr[targetIndex] = temp;
    setLocalWidgets(newArr);
  };

  const handleProjectSelect = (widgetId: string, projectId: string) => {
    setLocalWidgets((prev) =>
      prev.map((w) =>
        w.id === widgetId
          ? {
              ...w,
              config: {
                ...w.config,
                selectedProjectId: projectId,
              },
            }
          : w
      )
    );
  };

  const handleAddDefaultWidget = (widget: WidgetConfig) => {
    if (localWidgets.some((w) => w.id === widget.id)) return;
    setLocalWidgets((prev) => [...prev, { ...widget, enabled: true }]);
  };

  const handleCreateCustomWidget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) return;

    const newWidget: WidgetConfig = {
      id: `custom_${Date.now()}`,
      title: customTitle.trim(),
      description: customDescription.trim() || 'Custom user dashboard summary card',
      enabled: true,
      category: customCategory,
      isCustom: true,
    };

    setLocalWidgets((prev) => [...prev, newWidget]);
    setCustomTitle('');
    setCustomDescription('');
    setIsAddModuleOpen(false);
  };

  const handleApplyPreset = (presetType: 'ALL' | 'TREASURY' | 'PROJECTS' | 'COMPLIANCE') => {
    if (presetType === 'ALL') {
      setLocalWidgets(DEFAULT_WIDGETS.map((w) => ({ ...w, enabled: true })));
    } else if (presetType === 'TREASURY') {
      setLocalWidgets(
        localWidgets.map((w) => ({
          ...w,
          enabled: ['banking_module', 'cash_reserves', 'pnl_chart', 'receivables', 'quick_actions'].includes(w.id),
        }))
      );
    } else if (presetType === 'PROJECTS') {
      setLocalWidgets(
        localWidgets.map((w) => ({
          ...w,
          enabled: ['selected_project', 'projects_overview', 'quick_actions', 'receivables'].includes(w.id),
        }))
      );
    } else if (presetType === 'COMPLIANCE') {
      setLocalWidgets(
        localWidgets.map((w) => ({
          ...w,
          enabled: ['tax_compliance', 'receivables', 'recent_invoices', 'cash_reserves'].includes(w.id),
        }))
      );
    }
  };

  const handleReset = () => {
    setLocalWidgets(DEFAULT_WIDGETS);
  };

  const handleSave = () => {
    onSaveWidgets(localWidgets);
    onClose();
  };

  // Find standard modules that are missing/deleted from localWidgets
  const deletedDefaultWidgets = DEFAULT_WIDGETS.filter(
    (def) => !localWidgets.some((w) => w.id === def.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-5 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800 font-bold">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">Customize Dashboard Layout</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Add, delete, reorder, or pin specific modules like Banking, Projects, or Custom Widgets
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Control Bar: Presets & Add Module Action */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
              Quick Layout Presets:
            </span>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <button
                onClick={() => handleApplyPreset('ALL')}
                className="px-2.5 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded-lg font-bold text-slate-700 shadow-2xs cursor-pointer"
              >
                All Modules
              </button>
              <button
                onClick={() => handleApplyPreset('TREASURY')}
                className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded-lg font-bold shadow-2xs cursor-pointer flex items-center gap-1"
              >
                <Landmark className="w-3 h-3" />
                Treasury
              </button>
              <button
                onClick={() => handleApplyPreset('PROJECTS')}
                className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg font-bold shadow-2xs cursor-pointer flex items-center gap-1"
              >
                <FolderKanban className="w-3 h-3" />
                Projects
              </button>
            </div>
          </div>

          <button
            onClick={() => setIsAddModuleOpen(!isAddModuleOpen)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer self-start sm:self-auto shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Module</span>
          </button>
        </div>

        {/* Add Module Panel Drawer (if open) */}
        {isAddModuleOpen && (
          <div className="p-4 bg-blue-50/50 border-b border-blue-200 shrink-0 space-y-4 animate-fade-in">
            <div className="flex justify-between items-center">
              <span className="font-extrabold text-xs text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-blue-600" />
                Add Module to Dashboard
              </span>
              <button
                onClick={() => setIsAddModuleOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            {/* Sub-section 1: Re-add deleted standard modules */}
            {deletedDefaultWidgets.length > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-600 block">Standard Catalog Modules Available:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {deletedDefaultWidgets.map((def) => (
                    <div
                      key={def.id}
                      className="p-2.5 bg-white rounded-xl border border-blue-100 hover:border-blue-300 flex justify-between items-center transition-all"
                    >
                      <div>
                        <span className="font-bold text-slate-800 text-xs block">{def.title}</span>
                        <span className="text-[10px] text-slate-500">{def.category}</span>
                      </div>
                      <button
                        onClick={() => handleAddDefaultWidget(def)}
                        className="px-2.5 py-1 bg-blue-100 hover:bg-blue-600 hover:text-white text-blue-800 font-bold rounded-lg text-[11px] transition-colors cursor-pointer"
                      >
                        + Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-section 2: Create Custom Module Form */}
            <form onSubmit={handleCreateCustomWidget} className="bg-white p-3.5 rounded-xl border border-blue-200 space-y-3">
              <span className="text-[11px] font-bold text-slate-800 block">Create Custom Dashboard Widget:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Widget Title (e.g. Q3 Tax Reserve)"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-600"
                />
                <input
                  type="text"
                  placeholder="Description (e.g. Track quarterly liabilities)"
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  className="bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-600"
                />
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value as any)}
                  className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-600"
                >
                  <option value="FINANCIAL">FINANCIAL</option>
                  <option value="BANKING">BANKING</option>
                  <option value="PROJECTS">PROJECTS</option>
                  <option value="TAX">TAX</option>
                  <option value="OPERATIONS">OPERATIONS</option>
                </select>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs cursor-pointer shadow-2xs"
                >
                  Create Custom Widget
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Scrollable Active Widgets List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          <div className="flex justify-between items-center text-xs font-bold text-slate-500 px-1">
            <span>
              Active Dashboard Layout ({localWidgets.filter((w) => w.enabled).length} Active / {localWidgets.length} Total)
            </span>
            <span>Controls & Reorder</span>
          </div>

          {localWidgets.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <p className="text-xs font-bold">All dashboard modules have been deleted.</p>
              <button
                onClick={handleReset}
                className="mt-2 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
              >
                Restore Default Layout
              </button>
            </div>
          ) : (
            localWidgets.map((widget, idx) => (
              <div
                key={widget.id}
                className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  widget.enabled
                    ? 'bg-white border-slate-200 shadow-2xs'
                    : 'bg-slate-50/70 border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start space-x-3 flex-1">
                  <button
                    type="button"
                    onClick={() => handleToggle(widget.id)}
                    className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                      widget.enabled
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-slate-200 text-slate-400 hover:bg-slate-300'
                    }`}
                    title={widget.enabled ? 'Disable' : 'Enable'}
                  >
                    {widget.enabled ? <Check className="w-4 h-4" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>

                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-sm text-slate-900">{widget.title}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                        {widget.category}
                      </span>
                      {widget.isCustom && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{widget.description}</p>

                    {/* Project Specific Dropdown Configuration */}
                    {widget.id === 'selected_project' && widget.enabled && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="text-xs font-bold text-indigo-700 shrink-0">Pin Particular Project:</span>
                        <select
                          value={widget.config?.selectedProjectId || ''}
                          onChange={(e) => handleProjectSelect(widget.id, e.target.value)}
                          className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-600 w-full sm:w-auto"
                        >
                          <option value="">-- Show First Active Project --</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.code}) • {p.clientName}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Controls: Reorder Up/Down + Delete Button */}
                <div className="flex items-center space-x-1 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, 'UP')}
                    className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 transition-colors cursor-pointer"
                    title="Move Up"
                  >
                    <MoveUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === localWidgets.length - 1}
                    onClick={() => handleMove(idx, 'DOWN')}
                    className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 transition-colors cursor-pointer"
                    title="Move Down"
                  >
                    <MoveDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(widget.id)}
                    className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer ml-1"
                    title="Delete Module"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            onClick={handleReset}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-colors shadow-xs cursor-pointer"
            >
              Save Custom Layout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

