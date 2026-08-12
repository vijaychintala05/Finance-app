import React, { useState } from 'react';
import {
  Clock,
  FileText,
  FolderKanban,
  Plus,
  Receipt,
  Search,
  TrendingUp,
} from 'lucide-react';
import { TimeEntry } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, getStatusBadgeStyle } from '../../utils/formatters';
import { LogTimeModal } from './LogTimeModal';
import { NewProjectModal } from './NewProjectModal';
import { ProjectDetailModal } from './ProjectDetailModal';
import { TimeLogsView } from './TimeLogsView';
import { InvoiceEditorModal } from '../invoices/InvoiceEditorModal';
import { ExpenseModal } from '../expenses/ExpenseModal';

export const ProjectsView: React.FC = () => {
  const { projects, getProjectSummary, settings } = useBooks();

  const [activeMainTab, setActiveMainTab] = useState<'projects' | 'time_logs'>('projects');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isLogTimeOpen, setIsLogTimeOpen] = useState(false);
  const [logTimeDefaultProject, setLogTimeDefaultProject] = useState<string | undefined>(undefined);
  const [editingTimeEntry, setEditingTimeEntry] = useState<TimeEntry | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);
  const [invoiceDefaultProject, setInvoiceDefaultProject] = useState<string | undefined>(undefined);
  const [isRecordExpenseOpen, setIsRecordExpenseOpen] = useState(false);
  const [expenseDefaultProject, setExpenseDefaultProject] = useState<string | undefined>(undefined);

  const handleOpenLogTime = (pId?: string, entryToEdit?: TimeEntry | null) => {
    setLogTimeDefaultProject(pId);
    setEditingTimeEntry(entryToEdit || null);
    setIsLogTimeOpen(true);
  };

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.clientName.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  if (selectedProject) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <ProjectDetailModal
          project={selectedProject}
          onClose={() => setSelectedProjectId(null)}
          onOpenLogTime={(pId) => {
            setLogTimeDefaultProject(pId);
            setIsLogTimeOpen(true);
          }}
        />
        <LogTimeModal
          isOpen={isLogTimeOpen}
          onClose={() => setIsLogTimeOpen(false)}
          defaultProjectId={logTimeDefaultProject}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Navigation Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
            <FolderKanban className="w-6 h-6 text-blue-600" />
            <span>Project & Time Tracking</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage client projects, billable staff hours, timesheets, costs, and net margins
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleOpenLogTime()}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
          >
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>+ Log Billable Hours</span>
          </button>
          <button
            onClick={() => setIsNewProjectOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Main Section Navigation Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-bold space-x-2">
        <button
          onClick={() => setActiveMainTab('projects')}
          className={`px-4 py-2.5 rounded-t-xl border-b-2 font-extrabold transition-all cursor-pointer flex items-center space-x-2 ${
            activeMainTab === 'projects'
              ? 'bg-white dark:bg-slate-900 border-blue-600 text-blue-600 dark:text-blue-400 shadow-xs'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          <span>Projects Dashboard ({projects.length})</span>
        </button>

        <button
          onClick={() => setActiveMainTab('time_logs')}
          className={`px-4 py-2.5 rounded-t-xl border-b-2 font-extrabold transition-all cursor-pointer flex items-center space-x-2 ${
            activeMainTab === 'time_logs'
              ? 'bg-white dark:bg-slate-900 border-blue-600 text-blue-600 dark:text-blue-400 shadow-xs'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
          }`}
        >
          <Clock className="w-4 h-4 text-emerald-500" />
          <span>Time Logs & Timesheets</span>
        </button>
      </div>

      {activeMainTab === 'time_logs' ? (
        <TimeLogsView
          onOpenLogTime={(pId, entryToEdit) => handleOpenLogTime(pId, entryToEdit)}
          onNavigateToInvoiceEditor={(pId) => {
            setInvoiceDefaultProject(pId);
            setIsCreateInvoiceOpen(true);
          }}
        />
      ) : (
        <>
          {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by code, project, or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-9 pr-3 py-2 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto text-xs">
          {['All', 'Active', 'On Hold', 'Completed'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredProjects.map((p) => {
          const summary = getProjectSummary(p.id);
          return (
            <div
              key={p.id}
              onClick={() => setSelectedProjectId(p.id)}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:border-blue-500/60 hover:shadow-md transition-all flex flex-col justify-between space-y-4 cursor-pointer group"
              title="Click to view full project dashboard"
            >
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      {p.code}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-1 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {p.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">{p.clientName}</p>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${getStatusBadgeStyle(
                      p.status
                    )}`}
                  >
                    {p.status}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 line-clamp-2">
                  {p.description || 'No description provided.'}
                </p>
              </div>

              {/* Financial Snapshot */}
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg text-center">
                    <span className="text-[10px] text-slate-500 block">Invoiced</span>
                    <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                      {formatCurrency(summary.totalInvoiced, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg text-center">
                    <span className="text-[10px] text-slate-500 block">Expenses</span>
                    <span className="font-bold font-mono text-rose-600 dark:text-rose-400">
                      {formatCurrency(summary.directExpenses, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg text-center">
                    <span className="text-[10px] text-slate-500 block">Net Profit</span>
                    <span
                      className={`font-bold font-mono ${
                        summary.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {formatCurrency(summary.netProfit, settings.currencySymbol)}
                    </span>
                  </div>
                </div>

                {/* Progress / Budget used */}
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                    <span>
                      Budget: {formatCurrency(p.totalBudget, settings.currencySymbol)} ({p.budgetType})
                    </span>
                    <span className="font-semibold">{summary.budgetUsedPercent}% Used</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        summary.budgetUsedPercent > 90
                          ? 'bg-rose-500'
                          : summary.budgetUsedPercent > 50
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, summary.budgetUsedPercent)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProjectId(p.id);
                  }}
                  className="flex-1 bg-blue-50 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-700 dark:text-blue-300 py-2 rounded-xl font-semibold text-center transition-colors cursor-pointer flex items-center justify-center space-x-1 border border-blue-200/60 dark:border-slate-700"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Dashboard</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setInvoiceDefaultProject(p.id);
                    setIsCreateInvoiceOpen(true);
                  }}
                  className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-slate-800 rounded-xl text-emerald-600 cursor-pointer"
                  title="Create Invoice for this project"
                >
                  <FileText className="w-4 h-4 text-emerald-600" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpenseDefaultProject(p.id);
                    setIsRecordExpenseOpen(true);
                  }}
                  className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-xl text-rose-600 cursor-pointer"
                  title="Record Expense for this project"
                >
                  <Receipt className="w-4 h-4 text-rose-600" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setLogTimeDefaultProject(p.id);
                    setIsLogTimeOpen(true);
                  }}
                  className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl text-blue-600 cursor-pointer"
                  title="Log Hours for this project"
                >
                  <Clock className="w-4 h-4 text-blue-600" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      </>
      )}

      {/* Modals */}
      <NewProjectModal isOpen={isNewProjectOpen} onClose={() => setIsNewProjectOpen(false)} />
      <LogTimeModal
        isOpen={isLogTimeOpen}
        onClose={() => {
          setIsLogTimeOpen(false);
          setEditingTimeEntry(null);
        }}
        defaultProjectId={logTimeDefaultProject}
        editingTimeEntry={editingTimeEntry}
      />
      <InvoiceEditorModal
        isOpen={isCreateInvoiceOpen}
        onClose={() => setIsCreateInvoiceOpen(false)}
        defaultProjectId={invoiceDefaultProject}
      />
      <ExpenseModal
        isOpen={isRecordExpenseOpen}
        onClose={() => setIsRecordExpenseOpen(false)}
        defaultProjectId={expenseDefaultProject}
      />
    </div>
  );
};
