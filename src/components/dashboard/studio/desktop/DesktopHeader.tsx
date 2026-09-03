import React from 'react';
import { 
  UserCheck, 
  Calendar, 
  Building2, 
  Users, 
  SlidersHorizontal, 
  Plus, 
  ChevronDown, 
  CheckSquare, 
  AlertCircle, 
  Clock, 
  FileText 
} from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';
import { UserRole } from '../types';
import { useAuth } from '../../../../context/AuthContext';

export const DesktopHeader: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const { user } = useAuth(); const authMode: string = 'authenticated';
  const {
    todayDateStr,
    settings,
    activeRole,
    setActiveRole,
    updateSettings,
    showToast,
    dateRangeFilter,
    setDateRangeFilter,
    selectedProjectFilter,
    setSelectedProjectFilter,
    projects,
    selectedTeamFilter,
    setSelectedTeamFilter,
    setIsMobileFilterOpen,
    dropdownRef,
    isCreateDropdownOpen,
    setIsCreateDropdownOpen,
    onOpenNewTask,
    setIsSiteIssueModalOpen,
    setIsMeetingModalOpen,
    onNavigate,
    setActiveKpiDrawer
  } = dashboard;

  return (
    <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-2xs space-y-4">
      {/* Top Row: Greeting, Current Role Switcher, Date */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium mb-1">
            <span>{todayDateStr}</span>
            <span>•</span>
            <span className="text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Live Operations Center
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
            Good morning, {(user?.fullName || settings.principalName).split(' ')[0] || 'Vijay'}
          </h1>
        </div>

        {/* Role Switcher Pill */}
        <div className="flex items-center gap-2 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/60 self-start md:self-auto max-w-full overflow-hidden">
          <span className="text-[11px] font-bold text-slate-500 px-2 shrink-0 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-slate-700" />
            <span>Role:</span>
          </span>
          <select
            value={activeRole}
            onChange={(e) => {
              if (authMode !== 'local') return;
              const newRole = e.target.value as UserRole;
              setActiveRole(newRole);
              updateSettings({ currentRole: newRole as any });
              showToast(`Switched view mode to: ${newRole}`);
            }}
            disabled={authMode !== 'local'}
            className="bg-white font-bold text-xs text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer max-w-[220px] truncate"
          >
            <option value="Principal Architect">Principal Architect (Firm-wide)</option>
            <option value="Project Manager">Project Manager</option>
            <option value="Employee">Employee / Designer</option>
            <option value="Site Engineer">Site Engineer</option>
            <option value="Reviewer">QA Reviewer</option>
            <option value="Admin">Admin / System</option>
          </select>
        </div>
      </div>

      {/* Bottom Row: Desktop Filters & Single "+ Create" Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Desktop Filter Controls */}
        <div className="hidden md:flex items-center gap-3">
          {/* Date Range Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={dateRangeFilter}
              onChange={(e) => setDateRangeFilter(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="Today">Today</option>
              <option value="This Week">This Week</option>
              <option value="This Month">This Month</option>
              <option value="Q3 2026">Q3 2026</option>
            </select>
          </div>

          {/* Project Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedProjectFilter}
              onChange={(e) => setSelectedProjectFilter(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer max-w-[150px] truncate"
            >
              <option value="All">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Team Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedTeamFilter}
              onChange={(e) => setSelectedTeamFilter(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="All">All Teams</option>
              <option value="Design">Design Studio</option>
              <option value="Site / Execution">Site & Execution</option>
              <option value="3D & Visuals">3D Visuals</option>
              <option value="QA">QA / Compliance</option>
            </select>
          </div>
        </div>

        {/* Mobile Filter Trigger Button */}
        <button
          onClick={() => setIsMobileFilterOpen(true)}
          className="md:hidden flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer border border-slate-200/80"
        >
          <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
          <span>Filters: {selectedProjectFilter === 'All' ? 'All Projects' : '1 Project'} • {dateRangeFilter}</span>
        </button>

        {/* REFINED: Single "+ Create" Dropdown */}
        <div className="relative self-end sm:self-auto" ref={dropdownRef}>
          <button
            onClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Create Action</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isCreateDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isCreateDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <button
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  onOpenNewTask();
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-xs font-bold text-slate-800 transition-colors cursor-pointer"
              >
                <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div>Create Task</div>
                  <span className="text-[10px] text-slate-400 font-normal">Assign task to designer or site lead</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  setIsSiteIssueModalOpen(true);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-xs font-bold text-slate-800 transition-colors border-t border-slate-100 cursor-pointer"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <div>
                  <div>Add Site Issue</div>
                  <span className="text-[10px] text-slate-400 font-normal">Log snag, defect or safety alert</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  setIsMeetingModalOpen(true);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-xs font-bold text-slate-800 transition-colors border-t border-slate-100 cursor-pointer"
              >
                <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
                <div>
                  <div>Schedule Meeting</div>
                  <span className="text-[10px] text-slate-400 font-normal">Client or site coordination meeting</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  showToast("Daily time log opened.");
                  onNavigate('time-log');
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-xs font-bold text-slate-800 transition-colors border-t border-slate-100 cursor-pointer"
              >
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <div>Log Daily Time</div>
                  <span className="text-[10px] text-slate-400 font-normal">Record operational hours & progress</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsCreateDropdownOpen(false);
                  showToast("Redirecting to Review Queue upload...");
                  setActiveKpiDrawer('reviews');
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-xs font-bold text-slate-800 transition-colors border-t border-slate-100 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div>Submit Drawing for Review</div>
                  <span className="text-[10px] text-slate-400 font-normal">Upload DWG or PDF working drawing</span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
