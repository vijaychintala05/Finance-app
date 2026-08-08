import React, { useState } from 'react';
import { ShieldCheck, Search, Filter, Download, Terminal, Clock, Monitor, User, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatDate } from '../../utils/formatters';

export const AuditLogsSettings: React.FC = () => {
  const { auditLogs, currentOrg } = useBooks();

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'All' | 'Info' | 'Warning' | 'Critical'>('All');

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      log.userName.toLowerCase().includes(search.toLowerCase()) ||
      log.targetResource.toLowerCase().includes(search.toLowerCase()) ||
      log.ipAddress.includes(search);

    const matchesSeverity = severityFilter === 'All' || log.severity === severityFilter;

    return matchesSearch && matchesSeverity;
  });

  const handleExportLogs = () => {
    const jsonStr = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${currentOrg.publicOrgId}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Immutable Security & Compliance Audit Log Stream</h3>
          </div>
          <p className="text-slate-500 text-xs mt-1">
            Real-time, append-only log capturing user actions, authorization changes, financial edits, and authentication events.
          </p>
        </div>

        <button
          onClick={handleExportLogs}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-2 cursor-pointer transition-colors text-xs self-start md:self-auto shadow-2xs"
        >
          <Download className="w-3.5 h-3.5" /> Export Audit Log JSON
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Search action, user, target ID, IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:border-indigo-600"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-600">Severity:</span>
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
            {(['All', 'Info', 'Warning', 'Critical'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                  severityFilter === sev ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Log Stream Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target Resource</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">IP Address & Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                    No matching audit logs found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const getSevBadge = (sev: typeof log.severity) => {
                    switch (sev) {
                      case 'Critical':
                        return (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-bold rounded flex items-center gap-1 w-max">
                            <ShieldAlert className="w-3 h-3 text-rose-600" /> Critical
                          </span>
                        );
                      case 'Warning':
                        return (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded flex items-center gap-1 w-max">
                            <AlertTriangle className="w-3 h-3 text-amber-600" /> Warning
                          </span>
                        );
                      case 'Info':
                      default:
                        return (
                          <span className="px-2 py-0.5 bg-sky-100 text-sky-800 font-bold rounded flex items-center gap-1 w-max">
                            <CheckCircle2 className="w-3 h-3 text-sky-600" /> Info
                          </span>
                        );
                    }
                  };

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-slate-500 font-sans whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatDate(log.timestamp)}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-sans">{getSevBadge(log.severity)}</td>

                      <td className="py-3 px-4 font-bold text-slate-800 font-mono">
                        <span className="px-2 py-1 bg-slate-100 rounded text-slate-800 border border-slate-200">
                          {log.action}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-indigo-700 font-bold font-mono">
                        {log.targetResource}
                      </td>

                      <td className="py-3 px-4 text-slate-700 font-sans">
                        <div className="font-bold">{log.userName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{log.userEmail}</div>
                      </td>

                      <td className="py-3 px-4 text-slate-500 font-sans">
                        <div className="font-mono text-slate-700 font-bold">{log.ipAddress}</div>
                        <div className="text-[10px] text-slate-400">{log.device}</div>
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
