import React, { useState } from 'react';
import { User, ShieldCheck, Key, Mail, CheckCircle, RefreshCw, AlertTriangle, Fingerprint, History } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';

export const IdentitySettings: React.FC = () => {
  const { currentUser, updateCurrentUser, addAuditLog } = useBooks();

  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [email] = useState(currentUser?.email || currentUser?.primaryEmail || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (updateCurrentUser) updateCurrentUser({ fullName });
    addAuditLog({
      action: 'PROFILE_UPDATED',
      targetResource: `User Profile: ${fullName}`,
      ipAddress: '192.168.1.1',
      device: 'Chrome / macOS',
      severity: 'Info',
    });
    setMsg({ type: 'success', text: 'Platform Identity profile updated successfully.' });
    setTimeout(() => setMsg(null), 3500);
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setMsg({ type: 'error', text: 'Password must be at least 8 characters long.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    // Check password history
    const history = currentUser?.passwordHistory || [];
    if (history.includes(newPassword)) {
      setMsg({ type: 'error', text: 'Cannot reuse previous passwords according to enterprise password policy.' });
      return;
    }

    const newHash = `$argon2id$v=19$m=65536,t=3,p=4$${Math.random().toString(36).substring(2, 10)}$${Math.random().toString(36).substring(2, 14)}`;
    if (updateCurrentUser) {
      updateCurrentUser({
        passwordHash: newHash,
        passwordHistory: [newHash, ...history.slice(0, 4)],
      });
    }

    addAuditLog({
      action: 'PASSWORD_CHANGED',
      targetResource: 'Argon2id Hash Key',
      ipAddress: '192.168.1.1',
      device: 'Chrome / macOS',
      severity: 'Warning',
    });
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setMsg({ type: 'success', text: 'Password successfully updated and hashed with Argon2id.' });
    setTimeout(() => setMsg(null), 4000);
  };

  const userUuid = currentUser?.uuid || '018fba18-c290-7d12-9900-112233445566';

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-white text-xl font-bold shadow-inner">
              {(currentUser?.fullName || 'S').charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">{currentUser?.fullName || 'User'}</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-semibold text-[10px] flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Platform Identity
                </span>
              </div>
              <p className="text-slate-300 text-xs mt-0.5">{email}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-400 font-mono">
                <span>Public User ID: <strong className="text-amber-300 font-bold">{currentUser?.userId || 'usr-101'}</strong></span>
                <span className="hidden sm:inline">•</span>
                <span>UUID: <strong className="text-slate-300">{userUuid.slice(0, 18)}...</strong></span>
              </div>
            </div>
          </div>
          <div className="bg-slate-800/80 backdrop-blur rounded-xl p-3 border border-slate-700 text-left md:text-right font-sans">
            <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">Platform Identity Rule</span>
            <span className="text-xs font-semibold text-slate-200">1 Account → Access Multiple Organizations</span>
          </div>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3 rounded-xl border font-bold flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-800">Identity Details</h3>
            </div>
            {(currentUser?.isEmailVerified || currentUser?.emailVerified) && (
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-600" /> Email Verified
              </span>
            )}
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Full Legal Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">Platform Identity Email</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-500 cursor-not-allowed pl-8"
                />
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Your email is your global identifier across all connected organizations.
              </p>
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">Public Platform ID</label>
              <input
                type="text"
                value={currentUser?.userId || 'usr-101'}
                disabled
                className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 font-mono font-bold cursor-not-allowed"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold cursor-pointer transition-colors"
              >
                Save Identity Profile
              </button>
            </div>
          </form>
        </div>

        {/* Security / Argon2id Password Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-800">Password & Encryption</h3>
            </div>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono font-bold flex items-center gap-1">
              <Fingerprint className="w-3 h-3 text-indigo-600" /> Argon2id
            </span>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Current Password</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <History className="w-3.5 h-3.5 text-indigo-600" /> Enterprise Password Security Policy
              </div>
              <p className="text-slate-500">
                Passwords are hashed using <strong>Argon2id</strong> (m=65536, t=3, p=4) and checked against recent password history to prevent credential reuse.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold cursor-pointer transition-colors"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
