import React, { useEffect, useState } from 'react';
import {
  Shield,
  Smartphone,
  Laptop,
  Globe,
  Mail,
  KeyRound,
  UserPlus,
  RefreshCw,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useBooks } from '../../context/BooksContext';
import { MfaEnrollmentModal } from './MfaEnrollmentModal';

interface SessionItem {
  id: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
  status: string;
  expiresAt: string;
  lastActivityAt: string;
  createdAt: string;
}

interface OutboxItem {
  id: string;
  recipientEmail: string;
  templateType: string;
  deliveryStatus: 'PENDING' | 'SENT' | 'FAILED' | 'RETRYING';
  retryCount: number;
  lastError?: string;
  createdAt: string;
}

interface SecurityEventItem {
  id: string;
  eventType: string;
  ipAddress?: string;
  metadata?: any;
  created_at: string;
}

export const SecurityCenterView: React.FC = () => {
  const { currentOrg } = useBooks();

  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [events, setEvents] = useState<SecurityEventItem[]>([]);
  const [mfaStatus, setMfaStatus] = useState<{ isEnrolled: boolean; isVerified: boolean; remainingRecoveryCodes: number }>({
    isEnrolled: false,
    isVerified: false,
    remainingRecoveryCodes: 0,
  });

  const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Staff');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchSecurityData = async () => {
    setBusy(true);
    try {
      const [sessionsRes, outboxRes, eventsRes, mfaRes] = await Promise.all([
        apiClient.get<{ currentSessionId: string; sessions: SessionItem[] }>('/identity/sessions'),
        apiClient.get<OutboxItem[]>('/identity/outbox'),
        apiClient.get<SecurityEventItem[]>('/identity/security-events'),
        apiClient.get<any>('/identity/mfa/status'),
      ]);

      if (sessionsRes.data) {
        setCurrentSessionId(sessionsRes.data.currentSessionId);
        setSessions(sessionsRes.data.sessions || []);
      }
      if (outboxRes.data) {
        setOutbox(outboxRes.data);
      }
      if (eventsRes.data) {
        setEvents(eventsRes.data);
      }
      if (mfaRes.data) {
        setMfaStatus(mfaRes.data);
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void fetchSecurityData();
  }, []);

  const handleRevokeSession = async (sessionId: string) => {
    await apiClient.post(`/identity/sessions/${sessionId}/revoke`, {});
    await fetchSecurityData();
  };

  const handleRevokeOthers = async () => {
    await apiClient.post('/identity/sessions/revoke-others', {});
    await fetchSecurityData();
  };

  const handleIssueInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setBusy(true);
    setInviteError('');
    setInviteSuccess('');
    const res = await apiClient.post<any>('/identity/invitations', {
      organizationId: currentOrg.id,
      email: inviteEmail,
      role: inviteRole,
    });
    setBusy(false);
    if (res.data) {
      setInviteSuccess(`Invitation queued for ${inviteEmail}. Check outbox delivery below.`);
      setInviteEmail('');
      await fetchSecurityData();
    } else {
      setInviteError(res.error || 'Failed to issue invitation.');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6 text-slate-800 dark:text-slate-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Identity & Security Center
              <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                Tailscale Private HTTPS
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage verified workforce access, active devices, multi-factor enforcement, and audit logs.
            </p>
          </div>
        </div>

        <button
          onClick={fetchSecurityData}
          disabled={busy}
          className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold rounded-xl flex items-center space-x-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Active Devices & MFA (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Sessions & Devices */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Laptop className="w-4 h-4 text-blue-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Active Devices & Opaque Sessions ({sessions.filter((s) => s.status === 'ACTIVE').length})
                </h3>
              </div>
              {sessions.filter((s) => s.status === 'ACTIVE' && s.id !== currentSessionId).length > 0 && (
                <button
                  onClick={handleRevokeOthers}
                  className="text-rose-600 dark:text-rose-400 hover:underline text-xs font-semibold flex items-center space-x-1 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Revoke All Other Devices</span>
                </button>
              )}
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sessions.map((sess) => {
                const isCurrent = sess.id === currentSessionId;
                const isActive = sess.status === 'ACTIVE';
                return (
                  <div key={sess.id} className="py-3 flex justify-between items-center text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {sess.deviceName || 'Web Browser'}
                        </span>
                        {isCurrent && (
                          <span className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                            This Device
                          </span>
                        )}
                        {!isActive && (
                          <span className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-[10px] px-1.5 py-0.5 rounded">
                            {sess.status}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 flex items-center space-x-3 text-[11px]">
                        <span>IP: {sess.ipAddress || '127.0.0.1'}</span>
                        <span>Last active: {new Date(sess.lastActivityAt || sess.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    {isActive && !isCurrent && (
                      <button
                        onClick={() => handleRevokeSession(sess.id)}
                        className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-semibold rounded-lg text-[11px] cursor-pointer"
                      >
                        Terminate
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Team Invitations & Outbox Delivery Status */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                <UserPlus className="w-4 h-4 text-emerald-500" />
                <span>Invite Team Member</span>
              </h3>
            </div>

            {inviteSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{inviteSuccess}</span>
              </div>
            )}
            {inviteError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-800 dark:text-rose-300 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{inviteError}</span>
              </div>
            )}

            <form onSubmit={handleIssueInvite} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <input
                type="email"
                required
                placeholder="colleague@firm.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="sm:col-span-2 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="Staff">Staff</option>
                <option value="Accountant">Accountant</option>
                <option value="Admin">Admin</option>
              </select>
              <button
                type="submit"
                disabled={busy || !inviteEmail}
                className="py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl cursor-pointer"
              >
                Send Invite
              </button>
            </form>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <h4 className="font-semibold text-xs text-slate-700 dark:text-slate-300">
                Transactional Email Outbox Status
              </h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {outbox.slice(0, 5).map((item) => (
                  <div key={item.id} className="py-2 flex justify-between items-center">
                    <div>
                      <span className="font-mono text-slate-800 dark:text-slate-200">{item.recipientEmail}</span>
                      <div className="text-[10px] text-slate-400">
                        {item.templateType} • {new Date(item.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        item.deliveryStatus === 'SENT'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : item.deliveryStatus === 'PENDING'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      }`}
                    >
                      {item.deliveryStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Two-Factor Auth & Audit Log */}
        <div className="space-y-6">
          {/* Two-Factor Authentication Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <KeyRound className="w-4 h-4 text-emerald-500" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Two-Factor Authentication
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Status:</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                    mfaStatus.isVerified
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {mfaStatus.isVerified ? 'ENABLED' : 'NOT CONFIGURED'}
                </span>
              </div>

              {mfaStatus.isVerified && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Recovery Codes:</span>
                  <span className="font-mono font-semibold">{mfaStatus.remainingRecoveryCodes} remaining</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsMfaModalOpen(true)}
                className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold rounded-xl text-slate-800 dark:text-slate-200 text-xs cursor-pointer"
              >
                {mfaStatus.isVerified ? 'Reconfigure 2FA' : 'Setup Two-Factor Auth'}
              </button>
            </div>
          </div>

          {/* Real-time Security Event Audit Stream */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Globe className="w-4 h-4 text-blue-500" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Security Audit Log
              </h3>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-72 overflow-y-auto">
              {events.slice(0, 10).map((ev) => (
                <div key={ev.id} className="py-2 space-y-0.5">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">
                    {ev.eventType}
                  </div>
                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>IP: {ev.ipAddress || '127.0.0.1'}</span>
                    <span>{new Date(ev.created_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <MfaEnrollmentModal
        isOpen={isMfaModalOpen}
        onClose={() => setIsMfaModalOpen(false)}
        onSuccess={() => void fetchSecurityData()}
      />
    </div>
  );
};
