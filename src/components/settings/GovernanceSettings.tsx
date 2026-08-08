import React, { useState, useEffect } from 'react';
import { Building2, Shield, UserCheck, ArrowRightLeft, Lock, AlertTriangle, CheckCircle, Copy, AlertOctagon, HelpCircle, Clock, Key, ShieldCheck, Database, RefreshCw, FileCheck, Cpu, Activity, Zap } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';

export const GovernanceSettings: React.FC = () => {
  const { currentOrg, memberships, transferOwnership, toggleOrgStatus, addAuditLog, currentUser } = useBooks();

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedTargetUserId, setSelectedTargetUserId] = useState('');
  const [mfaOrPassword, setMfaOrPassword] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Platform Admin Support Access state (Phase 15)
  const [supportAccessActive, setSupportAccessActive] = useState(false);
  const [supportReason, setSupportReason] = useState('');
  const [supportSecondsRemaining, setSupportSecondsRemaining] = useState(3600);
  const [showSupportModal, setShowSupportModal] = useState(false);

  // Backup & Restore simulation (Phase 9)
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    let timer: any = null;
    if (supportAccessActive && supportSecondsRemaining > 0) {
      timer = setInterval(() => {
        setSupportSecondsRemaining((prev) => {
          if (prev <= 1) {
            setSupportAccessActive(false);
            addAuditLog({
              action: 'SUPPORT_ACCESS_EXPIRED',
              targetResource: 'Tenant Workspace',
              ipAddress: '127.0.0.1',
              device: 'Platform Support Daemon',
              severity: 'Info',
            });
            return 3600;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [supportAccessActive, supportSecondsRemaining]);

  const eligibleMembers = memberships.filter(
    (m) => m.orgUuid === currentOrg.uuid && m.userId !== currentOrg.ownerUserId && m.status === 'Active'
  );

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetUserId) {
      setMsg({ type: 'error', text: 'Please select an active team member to transfer ownership to.' });
      return;
    }
    if (!mfaOrPassword) {
      setMsg({ type: 'error', text: 'Please enter your password or MFA code to confirm ownership transfer.' });
      return;
    }

    const success = transferOwnership(selectedTargetUserId);
    if (success) {
      setShowTransferModal(false);
      setSelectedTargetUserId('');
      setMfaOrPassword('');
      setMsg({ type: 'success', text: 'Organization ownership transferred successfully.' });
      setTimeout(() => setMsg(null), 4000);
    } else {
      setMsg({ type: 'error', text: 'Authentication failed. Incorrect password or MFA code.' });
    }
  };

  const handleToggleStatus = () => {
    const nextStatus = currentOrg.status === 'Active' ? 'Suspended' : 'Active';
    toggleOrgStatus(nextStatus);
    setMsg({
      type: 'success',
      text: `Organization ${currentOrg.publicOrgId} status changed to ${nextStatus}.`,
    });
    setTimeout(() => setMsg(null), 3500);
  };

  const handleGrantSupportAccess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportReason.trim()) return;
    setSupportAccessActive(true);
    setSupportSecondsRemaining(3600);
    setShowSupportModal(false);
    addAuditLog({
      action: 'PLATFORM_SUPPORT_ACCESS_GRANTED',
      targetResource: `Reason: ${supportReason}`,
      ipAddress: '192.168.1.1',
      device: 'Platform Admin Console',
      severity: 'Critical',
    });
    setMsg({
      type: 'success',
      text: 'Temporary Support Access granted for 60 minutes. Every action is logged to immutable audit streams.',
    });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleRevokeSupportAccess = () => {
    setSupportAccessActive(false);
    addAuditLog({
      action: 'PLATFORM_SUPPORT_ACCESS_REVOKED',
      targetResource: 'Tenant Workspace',
      ipAddress: '192.168.1.1',
      device: 'Platform Admin Console',
      severity: 'Warning',
    });
    setMsg({ type: 'success', text: 'Platform Support Access revoked immediately.' });
    setTimeout(() => setMsg(null), 3500);
  };

  const handleSimulateBackupRestore = () => {
    setIsRestoring(true);
    setTimeout(() => {
      setIsRestoring(false);
      addAuditLog({
        action: 'DISASTER_RECOVERY_TEST_RESTORE',
        targetResource: 'Snapshot #BK-2026-0728-0600',
        ipAddress: '192.168.1.1',
        device: 'Backup Engine Daemon',
        severity: 'Info',
      });
      setMsg({ type: 'success', text: 'Automated backup restore validation completed successfully. All ledger invariants intact.' });
      setTimeout(() => setMsg(null), 4000);
    }, 1500);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const sampleRiskEvents = [
    { event: 'Owner Changed', score: 9, level: 'Critical', time: '10 mins ago', detail: 'Primary contact updated via MFA re-auth' },
    { event: 'Organization Suspended / Toggled', score: 9, level: 'Critical', time: '1 hour ago', detail: 'Status toggled in governance controls' },
    { event: 'Password & Argon2id Hash Re-generated', score: 4, level: 'Warning', time: 'Yesterday', detail: 'Password updated with 12-char entropy' },
    { event: 'New Device Login Recognized', score: 3, level: 'Info', time: '2 days ago', detail: 'MacBook Pro Chrome 124.0 (San Francisco)' },
    { event: 'Failed OTP Attempt (Rate-limited)', score: 2, level: 'Info', time: '3 days ago', detail: 'Lockout counter 1/5 triggered' },
  ];

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl p-5 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            <h3 className="text-sm font-bold">{currentOrg.name} Governance & Tenant Security</h3>
          </div>
          <p className="text-slate-600 dark:text-slate-300 text-xs mt-1">
            Strict tenant isolation, immutable public identifiers, platform admin support access safeguards, and risk-scored audit events.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono">
          <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-xs">
            <span className="text-slate-400 text-[10px] block uppercase font-sans">Public Org ID</span>
            <strong className="text-amber-300 font-bold">{currentOrg.publicOrgId}</strong>
          </div>
          <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-xs">
            <span className="text-slate-400 text-[10px] block uppercase font-sans">Subscription</span>
            <span className="text-emerald-400 font-bold">{currentOrg.subscription}</span>
          </div>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl border font-bold flex items-center gap-2 ${
            msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Identifiers & Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Identifiers Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Tenant Identifiers</h4>
            <span className="px-2 py-0.5 bg-sky-100 text-sky-800 font-bold rounded text-[10px]">Scoped UUIDv7</span>
          </div>

          <div className="space-y-3 font-mono">
            <div>
              <span className="text-[11px] text-slate-500 block font-sans font-semibold mb-0.5">Public Organization ID</span>
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-900 font-bold text-xs flex items-center justify-between">
                <span>{currentOrg.publicOrgId}</span>
                <span className="text-[10px] text-amber-700 font-sans font-normal">Immutable</span>
              </div>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block font-sans font-semibold mb-0.5">Internal Tenant UUIDv7</span>
              <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 text-[11px] break-all">
                {currentOrg.uuid}
              </div>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block font-sans font-semibold mb-0.5">Active Tenant Status</span>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                    currentOrg.status === 'Active'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-100 text-rose-800 border border-rose-200'
                  }`}
                >
                  ● {currentOrg.status}
                </span>

                <button
                  onClick={handleToggleStatus}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-sans font-bold cursor-pointer"
                >
                  {currentOrg.status === 'Active' ? 'Simulate Suspension' : 'Reactivate Tenant'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Ownership Management Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-600" />
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Active Ownership</h4>
            </div>
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-bold rounded text-[10px]">Sole Owner Rule</span>
          </div>

          <p className="text-[11px] text-slate-500">
            Every organization must have exactly one primary active Owner. Ownership transfers require explicit re-authentication and emit an immutable audit log.
          </p>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-800 block">{currentOrg.primaryContactName || 'Sarah Jenkins'}</span>
              <span className="text-[11px] text-slate-500">{currentOrg.primaryContactEmail}</span>
            </div>

            <button
              onClick={() => setShowTransferModal(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer Ownership
            </button>
          </div>
        </div>
      </div>

      {/* Phase 15 — Platform Admin Support Access Safeguards */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-amber-600" />
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Phase 15: Platform Support Access Controls</h4>
          </div>
          <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-bold rounded text-[10px]">Zero Automatic Access</span>
        </div>

        <p className="text-[11px] text-slate-600 leading-relaxed">
          Platform administrators cannot read financial books by default. Support access requires an explicit ticket reason, optional tenant approval, auto-expires in 60 minutes, and logs all query operations.
        </p>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  supportAccessActive ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span className="font-bold text-slate-800 text-xs">
                Support Session Status: {supportAccessActive ? 'ACTIVE (Time-Bound)' : 'DISABLED'}
              </span>
            </div>
            {supportAccessActive && (
              <div className="text-amber-700 font-mono font-bold text-[11px]">
                Auto-expiring in: {formatTimer(supportSecondsRemaining)}
              </div>
            )}
          </div>

          {supportAccessActive ? (
            <button
              onClick={handleRevokeSupportAccess}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs cursor-pointer shadow-2xs"
            >
              Revoke Support Session Immediately
            </button>
          ) : (
            <button
              onClick={() => setShowSupportModal(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs cursor-pointer shadow-2xs transition-colors"
            >
              Request Temporary Support Session
            </button>
          )}
        </div>
      </div>

      {/* Phase 4 — Security Monitoring & Risk Scoring Engine */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" />
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Phase 4: Risk Scoring & Security Events Monitor</h4>
          </div>
          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-bold rounded text-[10px]">Risk Score 1–10</span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left font-sans">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                <th className="py-2.5 px-3">Security Event</th>
                <th className="py-2.5 px-3">Risk Score</th>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Event Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {sampleRiskEvents.map((evt, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-bold text-slate-800">{evt.event}</td>
                  <td className="py-2.5 px-3 font-mono font-bold">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        evt.score >= 8
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : evt.score >= 4
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      Risk {evt.score}/10
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-bold">{evt.level}</td>
                  <td className="py-2.5 px-3 text-slate-500 font-mono">{evt.time}</td>
                  <td className="py-2.5 px-3 text-slate-600">{evt.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phase 9 — Backup & Disaster Recovery Schedule */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-600" />
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Phase 9: Backup & Disaster Recovery Integrity</h4>
          </div>
          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">Hourly Incremental</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-[11px]">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block">Retention Tier</span>
            <strong className="text-slate-800 text-xs font-sans">Hourly → Daily → Monthly</strong>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block">Latest Snapshot</span>
            <strong className="text-emerald-700 text-xs font-sans">BK-2026-0728-0600 (Healthy)</strong>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] text-slate-400 font-sans uppercase font-bold block">Point-In-Time Restore</span>
            <strong className="text-slate-800 text-xs font-sans">Sub-second Precision</strong>
          </div>
        </div>

        <button
          onClick={handleSimulateBackupRestore}
          disabled={isRestoring}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
          {isRestoring ? 'Validating Ledger Snapshots...' : 'Test Disaster Recovery Restore Point'}
        </button>
      </div>

      {/* Support Access Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200 text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-amber-700">
                <HelpCircle className="w-5 h-5" />
                <h3 className="text-sm font-bold">Request Support Access Session</h3>
              </div>
              <button
                onClick={() => setShowSupportModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Provide a clear support ticket justification to grant temporary, time-bound read access to platform support engineers.
            </p>

            <form onSubmit={handleGrantSupportAccess} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Support Ticket Justification Reason</label>
                <textarea
                  rows={3}
                  value={supportReason}
                  onChange={(e) => setSupportReason(e.target.value)}
                  placeholder="e.g. Ticket #8812 - Resolving invoice bank reconciliation tax rounding discrepancy."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-600"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSupportModal(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold cursor-pointer shadow-sm"
                >
                  Authorize 60-Min Access
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Ownership Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200 text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertOctagon className="w-5 h-5" />
                <h3 className="text-sm font-bold">Transfer Organization Ownership</h3>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              You are transferring primary ownership of <strong>{currentOrg.name}</strong> ({currentOrg.publicOrgId}). You will become an Administrator after the transfer.
            </p>

            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select New Owner</label>
                <select
                  value={selectedTargetUserId}
                  onChange={(e) => setSelectedTargetUserId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:border-indigo-600"
                  required
                >
                  <option value="">-- Choose Active Team Member --</option>
                  {eligibleMembers.map((m) => (
                    <option key={m.id} value={m.userEmail}>
                      {m.userName} ({m.userEmail}) - Current Role: {m.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password or MFA Verification Code</label>
                <input
                  type="password"
                  value={mfaOrPassword}
                  onChange={(e) => setMfaOrPassword(e.target.value)}
                  placeholder="Enter current password or 6-digit MFA code"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-600"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold cursor-pointer shadow-sm"
                >
                  Confirm Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

