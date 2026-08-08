import React, { useState } from 'react';
import { Monitor, Smartphone, Globe, ShieldAlert, LogOut, CheckCircle, RefreshCw, Clock, MapPin, AlertTriangle } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';

export const ActiveSessionsSettings: React.FC = () => {
  const { sessions, revokeSession, revokeAllOtherSessions, addAuditLog } = useBooks();
  const [successMsg, setSuccessMsg] = useState('');

  const handleRevoke = (sessionId: string, deviceName: string) => {
    revokeSession(sessionId);
    addAuditLog('session.revoke', `Session: ${deviceName}`, 'Warning');
    setSuccessMsg(`Session for "${deviceName}" was revoked successfully.`);
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  const handleRevokeAllOthers = () => {
    revokeAllOtherSessions();
    addAuditLog('session.revoke_all_others', 'All Other Sessions', 'Critical');
    setSuccessMsg('All other active sessions have been revoked.');
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Active Sessions & Trusted Devices</h3>
          </div>
          <p className="text-slate-500 text-xs mt-1">
            Monitor and manage browser logins across your devices. Refresh tokens rotate on every access token issuance (15 min expiry).
          </p>
        </div>

        <button
          onClick={handleRevokeAllOthers}
          className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold flex items-center gap-2 cursor-pointer transition-colors text-xs self-start md:self-auto"
        >
          <LogOut className="w-3.5 h-3.5" />
          Revoke All Other Sessions
        </button>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold rounded-xl flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Sessions List */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Active Device Connections ({sessions.length})</h4>

        <div className="divide-y divide-slate-100">
          {sessions.map((sess) => {
            const isMobile = sess.device.toLowerCase().includes('iphone') || sess.device.toLowerCase().includes('android');

            return (
              <div key={sess.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl border ${sess.isCurrentSession ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                    {isMobile ? <Smartphone className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 text-xs">{sess.device}</span>
                      {sess.isCurrentSession && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1 border border-emerald-200">
                          <CheckCircle className="w-3 h-3 text-emerald-600" /> Current Device
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3 text-slate-400" /> {sess.browser}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono text-slate-600">
                        {sess.ipAddress}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" /> {sess.location}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <Clock className="w-3 h-3" /> Last Activity: <strong className="text-slate-600 font-semibold">{sess.lastActive}</strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  {!sess.isCurrentSession ? (
                    <button
                      onClick={() => handleRevoke(sess.id, sess.device)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 rounded-lg text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
                    >
                      Revoke
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400 font-medium italic">Active</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Security Token Policy Card */}
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex items-start gap-3 shadow-2xs">
        <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h5 className="font-bold text-xs text-slate-900 dark:text-slate-100">JWT Token Security & Session Lifecycle</h5>
          <p className="text-[11px] text-slate-600 dark:text-slate-300">
            Access Tokens expire every 15 minutes. Refresh Tokens last 30 days and are automatically rotated upon every token refresh. Invalidated or revoked sessions instantly revoke access across all organization modules.
          </p>
        </div>
      </div>
    </div>
  );
};
