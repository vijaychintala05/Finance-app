import React, { useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  Download,
  Edit2,
  FileText,
  Filter,
  FolderKanban,
  Plus,
  Search,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { TimeEntry } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface TimeLogsViewProps {
  onOpenLogTime: (projectId?: string, entryToEdit?: TimeEntry | null) => void;
  onNavigateToInvoiceEditor?: (projectId?: string) => void;
}

export const TimeLogsView: React.FC<TimeLogsViewProps> = ({
  onOpenLogTime,
  onNavigateToInvoiceEditor,
}) => {
  const {
    timeEntries,
    projects,
    clients,
    settings,
    deleteTimeEntry,
    convertUnbilledTimeToInvoice,
  } = useBooks();

  const [search, setSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [selectedStaff, setSelectedStaff] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'hours-desc' | 'amount-desc'>(
    'date-desc'
  );

  // Extract unique staff names from timeEntries
  const uniqueStaff = Array.from(
    new Set(timeEntries.map((t) => t.staffName).filter(Boolean))
  ).sort();

  // Filter time entries
  const filteredEntries = timeEntries.filter((entry) => {
    // Project filter
    if (selectedProjectId !== 'ALL' && entry.projectId !== selectedProjectId) {
      return false;
    }

    // Staff / Employee filter
    if (selectedStaff !== 'ALL' && entry.staffName !== selectedStaff) {
      return false;
    }

    // Billing Status filter
    if (selectedStatus === 'BILLABLE' && !entry.isBillable) return false;
    if (selectedStatus === 'NON_BILLABLE' && entry.isBillable) return false;
    if (selectedStatus === 'UNBILLED' && (!entry.isBillable || entry.isBilled)) return false;
    if (selectedStatus === 'BILLED' && !entry.isBilled) return false;

    // Search filter
    if (search.trim()) {
      const query = search.toLowerCase();
      const matchTask = entry.taskName.toLowerCase().includes(query);
      const matchStaff = entry.staffName.toLowerCase().includes(query);
      const matchProject = entry.projectName.toLowerCase().includes(query);
      const matchClient = entry.clientName.toLowerCase().includes(query);
      const matchDesc = entry.description?.toLowerCase().includes(query);
      if (!matchTask && !matchStaff && !matchProject && !matchClient && !matchDesc) {
        return false;
      }
    }

    return true;
  });

  // Sort entries
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    if (sortBy === 'date-desc') {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
    if (sortBy === 'date-asc') {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }
    if (sortBy === 'hours-desc') {
      return b.hours - a.hours;
    }
    if (sortBy === 'amount-desc') {
      return b.hours * b.hourlyRate - a.hours * a.hourlyRate;
    }
    return 0;
  });

  // Analytics Metrics calculations
  const totalLoggedHours = sortedEntries.reduce((sum, e) => sum + e.hours, 0);
  const totalBillableHours = sortedEntries
    .filter((e) => e.isBillable)
    .reduce((sum, e) => sum + e.hours, 0);
  const totalUnbilledHours = sortedEntries
    .filter((e) => e.isBillable && !e.isBilled)
    .reduce((sum, e) => sum + e.hours, 0);

  const totalBillableValue = sortedEntries
    .filter((e) => e.isBillable)
    .reduce((sum, e) => sum + e.hours * e.hourlyRate, 0);
  const totalUnbilledValue = sortedEntries
    .filter((e) => e.isBillable && !e.isBilled)
    .reduce((sum, e) => sum + e.hours * e.hourlyRate, 0);
  const totalBilledValue = sortedEntries
    .filter((e) => e.isBilled)
    .reduce((sum, e) => sum + e.hours * e.hourlyRate, 0);

  const handleDelete = async (id: string, task: string) => {
    if (confirm(`Are you sure you want to delete the time log for "${task}"?`)) {
      await deleteTimeEntry(id);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Date',
      'Staff/Employee',
      'Project',
      'Client',
      'Task',
      'Hours',
      'Hourly Rate',
      'Total Amount',
      'Billable',
      'Billed',
      'Description',
    ];
    const rows = sortedEntries.map((e) => [
      e.date,
      `"${e.staffName.replace(/"/g, '""')}"`,
      `"${e.projectName.replace(/"/g, '""')}"`,
      `"${e.clientName.replace(/"/g, '""')}"`,
      `"${e.taskName.replace(/"/g, '""')}"`,
      e.hours,
      e.hourlyRate,
      e.hours * e.hourlyRate,
      e.isBillable ? 'Yes' : 'No',
      e.isBilled ? 'Yes' : 'No',
      `"${(e.description || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `time_logs_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBatchInvoice = async () => {
    if (selectedProjectId !== 'ALL') {
      const prj = projects.find((p) => p.id === selectedProjectId);
      if (prj) {
        const inv = await convertUnbilledTimeToInvoice(prj.id, prj.clientId);
        if (inv) {
          alert(
            `Successfully created Invoice ${inv.invoiceNumber} from unbilled time logs for project ${prj.name}!`
          );
          if (onNavigateToInvoiceEditor) {
            onNavigateToInvoiceEditor(prj.id);
          }
        } else {
          alert('No unbilled billable hours found for this project.');
        }
      }
    } else {
      alert('Please select a specific project in the filter above to generate its invoice.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-blue-50 dark:bg-blue-950 text-blue-600 rounded-xl border border-blue-200 dark:border-blue-800">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                Staff Time Logs & Timesheets
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Track employee project hours, rate calculations, billable totals & unbilled balances
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Export filtered logs to CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          {selectedProjectId !== 'ALL' && (
            <button
              onClick={handleBatchInvoice}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Convert Unbilled to Invoice</span>
            </button>
          )}

          <button
            onClick={() => onOpenLogTime(selectedProjectId !== 'ALL' ? selectedProjectId : undefined)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Log Time Entry</span>
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Hours Logged
            </span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950 text-blue-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2">
            {totalLoggedHours} <span className="text-sm font-semibold text-slate-400">hrs</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Across {sortedEntries.length} time log entries
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Billable Hours
            </span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 rounded-lg">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
            {totalBillableHours} <span className="text-sm font-semibold text-emerald-500">hrs</span>
          </div>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
            {formatCurrency(totalBillableValue, settings.currencySymbol)} total billable value
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Unbilled Work Value
            </span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950 text-amber-600 rounded-lg">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
            {formatCurrency(totalUnbilledValue, settings.currencySymbol)}
          </div>
          <p className="text-[11px] text-amber-600 font-medium mt-1">
            {totalUnbilledHours} hrs ready for billing
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Invoiced & Billed
            </span>
            <div className="p-2 bg-purple-50 dark:bg-purple-950 text-purple-600 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-2">
            {formatCurrency(totalBilledValue, settings.currencySymbol)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Converted into customer invoices</p>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-semibold">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search task, staff, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-9 pr-3 py-2 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Project Filter */}
          <div>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 py-2 px-3 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
            >
              <option value="ALL">📁 All Projects ({projects.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.code}] {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Employee / Staff Filter */}
          <div>
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 py-2 px-3 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
            >
              <option value="ALL">👤 All Employees / Staff ({uniqueStaff.length})</option>
              {uniqueStaff.map((staff) => (
                <option key={staff} value={staff}>
                  👤 {staff}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 py-2 px-3 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
            >
              <option value="ALL">All Statuses</option>
              <option value="UNBILLED">⏳ Unbilled Hours Only</option>
              <option value="BILLED">✅ Invoiced / Billed Only</option>
              <option value="BILLABLE">💲 Billable Entries Only</option>
              <option value="NON_BILLABLE">🚫 Non-Billable Hours</option>
            </select>
          </div>
        </div>

        {/* Active Filters Summary Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold flex items-center space-x-1 text-slate-700 dark:text-slate-300">
              <Filter className="w-3 h-3 text-blue-500" />
              <span>Showing {sortedEntries.length} of {timeEntries.length} time entries</span>
            </span>

            {selectedProjectId !== 'ALL' && (
              <span className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded-md font-bold border border-blue-200 dark:border-blue-800">
                Project: {projects.find((p) => p.id === selectedProjectId)?.name || selectedProjectId}
              </span>
            )}

            {selectedStaff !== 'ALL' && (
              <span className="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 px-2 py-0.5 rounded-md font-bold border border-purple-200 dark:border-purple-800">
                Employee: {selectedStaff}
              </span>
            )}

            {selectedStatus !== 'ALL' && (
              <span className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded-md font-bold border border-amber-200 dark:border-amber-800">
                Status: {selectedStatus}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-400">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg text-slate-700 dark:text-slate-300 font-bold focus:outline-none"
            >
              <option value="date-desc">Latest Date First</option>
              <option value="date-asc">Oldest Date First</option>
              <option value="hours-desc">Highest Hours</option>
              <option value="amount-desc">Highest Amount ($)</option>
            </select>
          </div>
        </div>
      </div>

      {/* TIME LOGS DATA TABLE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-4">DATE & STAFF</th>
                <th className="p-4">PROJECT & CLIENT</th>
                <th className="p-4">TASK & DESCRIPTION</th>
                <th className="p-4 text-center">LOGGED HOURS</th>
                <th className="p-4 text-right">HOURLY RATE</th>
                <th className="p-4 text-right">TOTAL AMOUNT</th>
                <th className="p-4 text-center">BILLING STATUS</th>
                <th className="p-4 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                    No time logs match your filter criteria. Try clearing filters or click "+ Log Time Entry" to record hours.
                  </td>
                </tr>
              ) : (
                sortedEntries.map((entry) => {
                  const amount = entry.hours * entry.hourlyRate;
                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="p-4">
                        <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{formatDate(entry.date)}</span>
                        </div>
                        <div className="flex items-center space-x-1.5 text-blue-600 dark:text-blue-400 font-bold mt-1">
                          <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-extrabold flex items-center justify-center text-[9px] shrink-0">
                            {entry.staffName.substring(0, 2).toUpperCase()}
                          </div>
                          <span>{entry.staffName}</span>
                        </div>
                      </td>

                      <td className="p-4 space-y-0.5">
                        <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-1">
                          <FolderKanban className="w-3 h-3 text-blue-500 shrink-0" />
                          <span>{entry.projectName}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {entry.clientName}
                        </div>
                      </td>

                      <td className="p-4 space-y-1 max-w-xs">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {entry.taskName}
                        </div>
                        {entry.description && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                            {entry.description}
                          </div>
                        )}
                      </td>

                      <td className="p-4 text-center font-mono font-black text-sm text-slate-900 dark:text-slate-100">
                        {entry.hours} <span className="text-xs font-normal text-slate-400">hrs</span>
                      </td>

                      <td className="p-4 text-right font-mono text-slate-600 dark:text-slate-400">
                        {settings.currencySymbol}{entry.hourlyRate}/hr
                      </td>

                      <td className="p-4 text-right font-mono font-extrabold text-slate-900 dark:text-slate-100">
                        {formatCurrency(amount, settings.currencySymbol)}
                      </td>

                      <td className="p-4 text-center">
                        {entry.isBilled ? (
                          <span className="inline-flex items-center space-x-1 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle className="w-3 h-3" />
                            <span>Billed</span>
                          </span>
                        ) : entry.isBillable ? (
                          <span className="inline-flex items-center space-x-1 bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border border-amber-200 dark:border-amber-800">
                            <Clock className="w-3 h-3" />
                            <span>Unbilled</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border border-slate-200 dark:border-slate-700">
                            <span>Non-Billable</span>
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => onOpenLogTime(entry.projectId, entry)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors cursor-pointer"
                            title="Edit Time Entry"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id, entry.taskName)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors cursor-pointer"
                            title="Delete Time Entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
