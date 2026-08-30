import React, { useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Building2,
  ChevronRight,
  Grid,
  Monitor,
  Search,
  Settings as SettingsIcon,
  Shield,
  UserCheck,
} from 'lucide-react';
import { UsersRolesSettings } from './UsersRolesSettings';
import { IdentitySettings } from './IdentitySettings';
import { GovernanceSettings } from './GovernanceSettings';
import { AuditLogsSettings } from './AuditLogsSettings';
import { OrganizationSettings } from './OrganizationSettings';
import { MfaSettings } from './MfaSettings';

export type SettingsNavTab =
  | 'overview'
  | 'org-profile'
  | 'sec-identity'
  | 'sec-mfa'
  | 'sec-governance'
  | 'sec-audit'
  | 'usr-preferences';

interface SettingsItem {
  id: Exclude<SettingsNavTab, 'overview'>;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
}

const SETTINGS_ITEMS: SettingsItem[] = [
  {
    id: 'org-profile',
    label: 'Organization Profile & Settings',
    description: 'Configure business details, tax credentials, address, invoicing defaults, and bank details.',
    icon: Building2,
  },
  {
    id: 'sec-identity',
    label: 'Identity & Password',
    description: 'View your account and change your password.',
    icon: UserCheck,
  },
  {
    id: 'sec-mfa',
    label: 'Two-Factor Authentication (2FA)',
    description: 'Configure authenticator app (TOTP), 2FA enforcement, and emergency recovery codes.',
    icon: Shield,
  },
  {
    id: 'sec-governance',
    label: 'Workspace Governance',
    description: 'Verify tenant identity, status, and enforced controls.',
    icon: Shield,
  },
  {
    id: 'sec-audit',
    label: 'Security & Audit Logs',
    description: 'Review server-authored activity for this workspace.',
    icon: Activity,
  },
  {
    id: 'usr-preferences',
    label: 'Display Preferences',
    description: 'Set theme, language, date format, and timezone on this device.',
    icon: Monitor,
  },
];

const itemById = new Map(SETTINGS_ITEMS.map((item) => [item.id, item]));

export const SettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsNavTab>('overview');
  const [searchTerm, setSearchTerm] = useState('');

  const visibleItems = SETTINGS_ITEMS.filter((item) => {
    const query = searchTerm.trim().toLowerCase();
    return !query || `${item.label} ${item.description}`.toLowerCase().includes(query);
  });
  const activeItem = activeTab === 'overview' ? undefined : itemById.get(activeTab);

  const openItem = (id: SettingsNavTab) => setActiveTab(id);

  return (
    <div className="mx-auto min-h-screen max-w-[1200px] space-y-6 p-4 text-xs sm:p-6">
      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          {activeTab !== 'overview' && (
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className="flex cursor-pointer items-center gap-1 rounded-lg bg-slate-100 p-2 font-bold text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-600"
              title="Return to settings"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">All Settings</span>
            </button>
          )}
          <div>
            <h2 className="flex items-center space-x-2 text-base font-bold text-slate-900">
              <SettingsIcon className="h-5 w-5 text-blue-600" />
              <span>{activeItem?.label || 'Settings'}</span>
            </h2>
            <p className="text-[11px] text-slate-500">
              {activeItem?.description || 'The v1 settings surface contains only controls that are currently available.'}
            </p>
          </div>
        </div>
        <div className="max-w-md text-right text-[11px] text-slate-500">
          Financial data remains server-authoritative. This page does not pretend to save unsupported browser-only configuration.
        </div>
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-5">
          <div className="relative max-w-lg">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search available settings..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs font-medium text-slate-800 shadow-2xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-blue-950">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <div>
                <h3 className="text-sm font-bold">FirmBooks v1 settings</h3>
                <p className="mt-1 text-xs leading-5 text-blue-900/80">
                  These are the settings that have a real implementation today. Financial workflows, audit records, and tenant access are controlled by the server.
                </p>
              </div>
            </div>
          </div>

          {visibleItems.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item.id)}
                    className="group flex cursor-pointer items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-2xs transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-sm"
                  >
                    <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700 group-hover:bg-blue-600 group-hover:text-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-900">{item.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-blue-600" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">No available settings match that search.</div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs lg:sticky lg:top-4 lg:col-span-4">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className="mb-3 flex w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 text-left font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600"
            >
              <Grid className="h-4 w-4 text-blue-600" />
              <span>All available settings</span>
            </button>
            <div className="space-y-1">
              {SETTINGS_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeTab;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left font-bold transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {isActive && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0 lg:col-span-8">
            {activeTab === 'org-profile' && <OrganizationSettings />}
            {activeTab === 'sec-identity' && <IdentitySettings />}
            {activeTab === 'sec-mfa' && <MfaSettings />}
            {activeTab === 'sec-governance' && <GovernanceSettings />}
            {activeTab === 'sec-audit' && <AuditLogsSettings />}
            {activeTab === 'usr-preferences' && <UsersRolesSettings subTab="preferences" />}
          </section>
        </div>
      )}
    </div>
  );
};
