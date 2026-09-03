import React from 'react';
import { UserCheck, SlidersHorizontal, Building2 } from 'lucide-react';
import { DashboardDataReturn } from '../hooks/useDashboardData';
import { UserRole } from '../types';
import { useAuth } from '../../../../context/AuthContext';

export const MobileHeader: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const { user } = useAuth(); const authMode: string = 'authenticated';
  const {
    settings,
    activeRole,
    setActiveRole,
    updateSettings,
    showToast,
    setIsMobileFilterOpen,
    selectedProjectFilter,
    dateRangeFilter
  } = dashboard;

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
      {/* Top row: Greeting & Avatar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-extrabold flex items-center justify-center text-xs ring-2 ring-emerald-500/20 shrink-0">
            {settings.principalName.slice(0, 2).toUpperCase() || 'VC'}
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 leading-tight">
            {(user?.fullName || settings.principalName).split(' ')[0] || 'Vijay'}
            </h1>
            <p className="text-[10px] text-slate-500 font-medium">Studio Operations Center</p>
          </div>
        </div>

        {/* Role Selector Pill */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <UserCheck className="w-3.5 h-3.5 text-slate-600 ml-1 shrink-0" />
          <select
            value={activeRole}
            onChange={(e) => {
              if (authMode !== 'local') return;
              const newRole = e.target.value as UserRole;
              setActiveRole(newRole);
              updateSettings({ currentRole: newRole as any });
              showToast(`Role: ${newRole}`);
            }}
            disabled={authMode !== 'local'}
            className="bg-transparent text-[11px] font-bold text-slate-800 focus:outline-none cursor-pointer pr-1"
          >
            <option value="Principal Architect">Principal</option>
            <option value="Project Manager">PM</option>
            <option value="Employee">Designer</option>
            <option value="Site Engineer">Site Eng</option>
            <option value="Reviewer">QA</option>
          </select>
        </div>
      </div>

      {/* Filter Quick Trigger */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 truncate">
          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">
            {selectedProjectFilter === 'All' ? 'All Projects' : 'Selected Project'}
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-emerald-800 shrink-0">{dateRangeFilter}</span>
        </div>

        <button
          onClick={() => setIsMobileFilterOpen(true)}
          className="flex items-center gap-1 text-[11px] font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
        >
          <SlidersHorizontal className="w-3 h-3 text-emerald-600" />
          <span>Filter</span>
        </button>
      </div>
    </div>
  );
};
