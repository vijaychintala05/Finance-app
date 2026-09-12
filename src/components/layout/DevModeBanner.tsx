import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, UserCheck, ShieldAlert } from 'lucide-react';

export function DevModeBanner() {
  const auth = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  // In production builds, this component returns null immediately
  if (!import.meta.env.DEV) {
    return null;
  }

  const handleReseed = async () => {
    setSeeding(true);
    setSeedMessage(null);
    try {
      const res = await apiClient.post<{ message: string }>('/auth/dev-seed', {});
      setSeedMessage(res.data?.message || 'Demo data refreshed!');
      setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch {
      setSeedMessage('Reseed failed. See console.');
    } finally {
      setSeeding(false);
    }
  };

  const handleSwitchRole = async (role: string) => {
    if (auth.devLogin) {
      await auth.devLogin(role);
      window.location.reload();
    }
  };

  return (
    <aside
      aria-label="Developer test mode bar"
      className="fixed bottom-4 right-4 z-50 print:hidden font-sans select-none"
    >
      <div className="bg-slate-900/95 text-white border border-slate-700/80 shadow-2xl rounded-2xl backdrop-blur-md overflow-hidden transition-all duration-200 ease-in-out">
        {/* Minimized Pill Bar */}
        <div className="flex items-center gap-3 px-3.5 py-2 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="tracking-tight">Local Test Mode</span>
          </div>

          <span className="text-slate-500">|</span>

          <span className="text-slate-300 font-medium truncate max-w-[160px]">
            {auth.user?.fullName || 'Developer Admin'}
          </span>

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={isOpen ? 'Minimize test controls' : 'Expand test controls'}
          >
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Expanded Controls Drawer */}
        {isOpen && (
          <div className="p-3.5 pt-1 border-t border-slate-800 space-y-3 text-xs w-72">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Switch Role Persona
              </span>
              <div className="grid grid-cols-3 gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => handleSwitchRole('Owner')}
                  className="py-1 px-2 rounded bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition font-medium text-center"
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchRole('Accountant')}
                  className="py-1 px-2 rounded bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition font-medium text-center"
                >
                  Accountant
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchRole('Viewer')}
                  className="py-1 px-2 rounded bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition font-medium text-center"
                >
                  Auditor
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={seeding}
                onClick={handleReseed}
                className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 flex items-center justify-center gap-1.5 font-medium transition"
              >
                <RefreshCw className={`w-3 h-3 ${seeding ? 'animate-spin' : ''}`} />
                <span>{seeding ? 'Seeding...' : 'Reseed Demo Data'}</span>
              </button>
            </div>

            {seedMessage && (
              <p className="text-[11px] text-emerald-400 font-medium text-center pt-0.5 animate-fade-in">
                {seedMessage}
              </p>
            )}

            <div className="pt-1 text-[10px] text-slate-400 flex items-center justify-between">
              <span>HMR Live Reload: Active</span>
              <span className="text-emerald-400 font-mono">Vite 6</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
