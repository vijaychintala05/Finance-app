import React from 'react';
import { AlertTriangle, Building2, Lock, ShieldCheck } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';

export const GovernanceSettings: React.FC = () => {
  const { currentOrg } = useBooks();

  return (
    <div className="space-y-6 text-xs text-slate-700 dark:text-slate-300">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{currentOrg.name} Governance</h3>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Verified tenant identity from the authenticated server session.
          </p>
        </div>
        <span className={`px-3 py-1.5 rounded-lg font-bold text-[11px] ${currentOrg.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
          {currentOrg.status}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Public organization ID</span>
          <p className="mt-2 font-mono font-bold text-slate-900 dark:text-white break-all">{currentOrg.publicOrgId || 'Unavailable'}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Internal tenant ID</span>
          <p className="mt-2 font-mono font-bold text-slate-900 dark:text-white break-all">{currentOrg.uuid || 'Unavailable'}</p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-amber-900 dark:text-amber-200">Advanced governance controls are not enabled</h4>
          <p className="text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
            Ownership transfer, tenant suspension, support access, risk scoring, and disaster-recovery verification require dedicated server workflows, re-authentication, immutable audit records, and operational evidence. This application does not simulate those controls or display invented security events.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h4 className="font-bold text-slate-900 dark:text-white">Currently enforced</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            'Server-verified tenant membership',
            'Role-based route permissions',
            'Short-lived authenticated sessions',
            'Server-authored financial audit records',
          ].map((control) => (
            <div key={control} className="flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-semibold">{control}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
