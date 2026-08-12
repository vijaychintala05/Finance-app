import React from 'react';
import { AlertTriangle, Cpu, FileClock, ShieldCheck } from 'lucide-react';

interface AutomationSettingsProps {
  subTab: 'workflow-rules' | 'workflow-actions' | 'workflow-logs';
}

const LABELS: Record<AutomationSettingsProps['subTab'], string> = {
  'workflow-rules': 'Workflow rules',
  'workflow-actions': 'Workflow actions',
  'workflow-logs': 'Workflow execution logs',
};

export const AutomationSettings: React.FC<AutomationSettingsProps> = ({ subTab }) => (
  <div className="space-y-5">
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <div className="flex items-center gap-2">
        <Cpu className="w-5 h-5 text-blue-600" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{LABELS[subTab]}</h3>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Server-backed automation workspace</p>
    </div>

    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-5 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div>
        <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">Automation is not enabled yet</h4>
        <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
          Rules that can email customers, change credit status, approve expenses, or initiate accounting actions need a durable job queue, idempotent execution, permission checks, retries, dead-letter handling, and immutable server logs. The application does not create browser-only rules or show simulated executions.
        </p>
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-slate-900 dark:text-white">Fail-closed design</p>
          <p className="text-[11px] text-slate-500 mt-1">No side effect is represented as successful without a durable server acknowledgement.</p>
        </div>
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-start gap-3">
        <FileClock className="w-4 h-4 text-blue-600 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-slate-900 dark:text-white">Future-ready contract</p>
          <p className="text-[11px] text-slate-500 mt-1">Execution history will come from immutable server events, never local timestamps or example payloads.</p>
        </div>
      </div>
    </div>
  </div>
);
