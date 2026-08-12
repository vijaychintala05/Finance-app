import React from 'react';
import { AlertTriangle, Layers, Lock } from 'lucide-react';

export const BulkUpdatesView: React.FC = () => (
  <div className="space-y-5">
    <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800">
      <div className="flex items-center gap-3">
        <Layers className="w-5 h-5 text-blue-400" />
        <div>
          <h2 className="text-lg font-black">Bulk Accounting Operations</h2>
          <p className="text-xs text-slate-300 mt-1">High-impact changes require a dedicated audited server workflow.</p>
        </div>
      </div>
    </div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div>
        <h3 className="text-sm font-bold text-amber-900">Bulk mutation is not enabled</h3>
        <p className="text-xs text-amber-800 mt-1 leading-relaxed">
          Account locks, classifications, and journal verification cannot be changed in browser state. Future bulk jobs must validate every row, lock affected records, execute atomically where appropriate, return a durable job result, and write immutable per-record audit evidence.
        </p>
      </div>
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3 text-xs text-slate-600">
      <Lock className="w-4 h-4 text-slate-500" />
      Posted journals remain immutable; corrections use explicit reversals.
    </div>
  </div>
);
