import React from 'react';
import { Monitor, ShieldAlert } from 'lucide-react';

export const ActiveSessionsSettings: React.FC = () => (
  <div className="space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-start gap-3">
        <Monitor className="mt-0.5 h-5 w-5 text-indigo-600" />
        <div>
          <h3 className="text-sm font-bold text-slate-900">Session inventory is not enabled yet</h3>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            The app does not display fabricated devices, locations, or IP addresses. A session will appear here only after server-side session records and targeted revocation are implemented.
          </p>
        </div>
      </div>
    </div>
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p>Changing your password revokes all existing authentication tokens.</p>
    </div>
  </div>
);
