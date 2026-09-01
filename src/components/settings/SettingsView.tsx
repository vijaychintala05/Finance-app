import React, { useRef, useState } from 'react';
import { ArrowLeft, Building2, ChevronRight, FileText, Grid2X2, Search, Shield, SlidersHorizontal, Users, CheckSquare, ShieldCheck, Database, X } from 'lucide-react';
import { UsersRolesSettings } from './UsersRolesSettings';
import { RolesPermissionsSettings } from './RolesPermissionsSettings';
import { ApprovalSettings } from './ApprovalSettings';
import { TeamAccessView } from './TeamAccessView';
import { IdentitySettings } from './IdentitySettings';
import { GovernanceSettings } from './GovernanceSettings';
import { AuditLogsSettings } from './AuditLogsSettings';
import { RecoveryCenterView } from './RecoveryCenterView';
import { OrganizationSettings, type OrganizationSection } from './OrganizationSettings';
import { MfaSettings } from './MfaSettings';
import { useBooks } from '../../context/BooksContext';
import './settings.css';

export type SettingsNavTab =
  | 'overview'
  | 'org-profile'
  | 'org-tax'
  | 'org-invoicing'
  | 'org-bank'
  | 'usr-roles'
  | 'usr-approvals'
  | 'usr-members'
  | 'sec-identity'
  | 'sec-mfa'
  | 'sec-governance'
  | 'sec-audit'
  | 'sec-recovery'
  | 'usr-preferences';

type CategoryId = 'organization' | 'users-access' | 'transactions' | 'security' | 'preferences';

const CATEGORIES = [
  { id: 'organization', label: 'Organization', icon: Building2, tone: 'teal' },
  { id: 'users-access', label: 'Users & Roles', icon: Users, tone: 'indigo' },
  { id: 'transactions', label: 'Transaction Defaults', icon: FileText, tone: 'blue' },
  { id: 'security', label: 'Security & Recovery', icon: Shield, tone: 'rose' },
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal, tone: 'amber' },
] as const;

interface SettingsItem {
  id: Exclude<SettingsNavTab, 'overview'>;
  label: string;
  detail: string;
  keywords: string;
  category: CategoryId;
  section?: OrganizationSection;
}

const ITEMS: SettingsItem[] = [
  { id: 'org-profile', label: 'Organization Profile', detail: 'Business name, contact details & branding', keywords: 'company legal trade brand industry email phone', category: 'organization', section: 'profile' },
  { id: 'org-tax', label: 'Taxes & Address', detail: 'Tax identifiers & registered address', keywords: 'gst gstin vat pan cin city state postal zip country', category: 'organization', section: 'tax' },
  { id: 'usr-roles', label: 'Roles & Permissions', detail: 'Custom roles, permission matrix & SoD checks', keywords: 'roles permissions access control rbac sod matrix custom system', category: 'users-access' },
  { id: 'usr-approvals', label: 'Approval Workflows', detail: 'Multi-tier limits & self-approval rules', keywords: 'approvals threshold limits workflow purchase orders vendor bills expenses', category: 'users-access' },
  { id: 'usr-members', label: 'Team Members', detail: 'Active members, role assignment & invitations', keywords: 'team members invite users access roster', category: 'users-access' },
  { id: 'org-invoicing', label: 'Invoicing & Sequences', detail: 'Payment terms, prefixes & financial year', keywords: 'invoice prefix quote estimate purchase order bill notes fiscal month', category: 'transactions', section: 'invoicing' },
  { id: 'org-bank', label: 'Bank Details', detail: 'Beneficiary account & payment instructions', keywords: 'banking settlement wire ifsc swift iban routing', category: 'transactions', section: 'bank' },
  { id: 'sec-identity', label: 'Identity & Password', detail: 'Your account & sign-in credentials', keywords: 'user profile email login password change', category: 'security' },
  { id: 'sec-mfa', label: 'Two-Factor Authentication', detail: 'Authenticator & recovery codes', keywords: '2fa mfa totp enforcement emergency security', category: 'security' },
  { id: 'sec-audit', label: 'Security & Audit Logs', detail: 'Workspace activity & audit history', keywords: 'events actions log records', category: 'security' },
  { id: 'sec-recovery', label: 'Disaster Recovery', detail: 'Encrypted backups, staging & rollback', keywords: 'backup restore recovery snapshot export disaster', category: 'security' },
  { id: 'sec-governance', label: 'Workspace Governance', detail: 'Organization identity & status details', keywords: 'tenant status permissions', category: 'organization' },
  { id: 'usr-preferences', label: 'Display Preferences', detail: 'Theme, language, date format & timezone', keywords: 'appearance dark light system time zone device', category: 'preferences' },
];

export const SettingsView: React.FC = () => {
  const { currentOrg } = useBooks();
  const [activeTab, setActiveTab] = useState<SettingsNavTab>('overview');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [search, setSearch] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const activeItem = ITEMS.find((item) => item.id === activeTab);
  const query = search.trim().toLowerCase();
  const visibleItems = ITEMS.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      query.split(/\s+/).every((word) =>
        `${item.label} ${item.detail} ${item.keywords} ${item.category}`.toLowerCase().includes(word)
      )
  );

  const navigate = (tab: SettingsNavTab) => {
    setActiveTab(tab);
    setSearch('');
    requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      headingRef.current?.scrollIntoView({ block: 'nearest' });
    });
  };

  return (
    <div className="settings-workspace">
      <header className="settings-header">
        <div className="settings-title">
          <h1>Settings</h1>
          <span className="settings-org" title={currentOrg.name}>
            <Building2 size={14} aria-hidden="true" />
            {currentOrg.name}
          </span>
        </div>
        <div className="settings-search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Search settings"
            type="search"
            placeholder="Search settings (e.g. roles, approvals, gstin, invoice prefix)"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCategory('all');
            }}
          />
          {search && (
            <button type="button" aria-label="Clear search" title="Clear search" onClick={() => setSearch('')}>
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings navigation">
          <button
            type="button"
            className={`settings-nav-item ${activeTab === 'overview' && category === 'all' ? 'is-active' : ''}`}
            aria-current={activeTab === 'overview' && category === 'all' ? 'page' : undefined}
            onClick={() => {
              setCategory('all');
              navigate('overview');
            }}
          >
            <Grid2X2 size={16} />
            All Settings
          </button>
          {CATEGORIES.map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.id} className="settings-nav-group">
                {activeTab === 'overview' ? (
                  <button
                    type="button"
                    className={`settings-nav-item ${category === group.id ? 'is-active' : ''}`}
                    aria-current={category === group.id ? 'page' : undefined}
                    onClick={() => {
                      setCategory(group.id);
                      setSearch('');
                    }}
                  >
                    <Icon size={16} />
                    {group.label}
                  </button>
                ) : (
                  <>
                    <div className="settings-nav-label">{group.label}</div>
                    {ITEMS.filter((item) => item.category === group.id).map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`settings-nav-item settings-nav-child ${activeTab === item.id ? 'is-active' : ''}`}
                        aria-current={activeTab === item.id ? 'page' : undefined}
                        onClick={() => navigate(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </nav>

        <div className="settings-main">
          {activeTab === 'overview' || query ? (
            <>
              <div className="settings-content-heading">
                <h2 tabIndex={-1} ref={headingRef}>
                  {query ? 'Search Results' : category === 'all' ? 'All Settings' : CATEGORIES.find((group) => group.id === category)?.label}
                </h2>
                <span role="status">
                  {visibleItems.length} {visibleItems.length === 1 ? 'setting' : 'settings'}
                </span>
              </div>
              {visibleItems.length ? (
                <div className="settings-directory">
                  {CATEGORIES.filter((group) => visibleItems.some((item) => item.category === group.id)).map((group) => {
                    const Icon = group.icon;
                    return (
                      <section key={group.id} className="settings-category" aria-labelledby={`category-${group.id}`}>
                        <div className="settings-category-header">
                          <span className={`settings-category-icon is-${group.tone}`}>
                            <Icon size={18} aria-hidden="true" />
                          </span>
                          <h3 id={`category-${group.id}`}>{group.label}</h3>
                        </div>
                        <div className="settings-card-grid">
                          {visibleItems
                            .filter((item) => item.category === group.id)
                            .map((item) => (
                              <button
                                type="button"
                                key={item.id}
                                className="settings-card"
                                onClick={() => navigate(item.id)}
                              >
                                <div className="settings-card-body">
                                  <span className="settings-card-title">{item.label}</span>
                                  <span className="settings-card-detail">{item.detail}</span>
                                </div>
                                <ChevronRight size={16} className="settings-card-arrow" aria-hidden="true" />
                              </button>
                            ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="settings-empty">
                  <p>No settings matched your query.</p>
                  <button type="button" onClick={() => setSearch('')} className="btn-secondary">
                    Clear Search
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="settings-detail-pane">
              <button
                type="button"
                className="settings-back-btn"
                onClick={() => navigate('overview')}
                aria-label="Back to all settings"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Back to All Settings
              </button>

              <div className="settings-pane-header">
                <h2>{activeItem?.label}</h2>
                <p>{activeItem?.detail}</p>
              </div>

              {activeTab === 'org-profile' && <OrganizationSettings section="profile" />}
              {activeTab === 'org-tax' && <OrganizationSettings section="tax" />}
              {activeTab === 'org-invoicing' && <OrganizationSettings section="invoicing" />}
              {activeTab === 'org-bank' && <OrganizationSettings section="bank" />}
              {activeTab === 'usr-roles' && <RolesPermissionsSettings />}
              {activeTab === 'usr-approvals' && <ApprovalSettings />}
              {activeTab === 'usr-members' && <TeamAccessView />}
              {activeTab === 'sec-identity' && <IdentitySettings />}
              {activeTab === 'sec-mfa' && <MfaSettings />}
              {activeTab === 'sec-audit' && <AuditLogsSettings />}
              {activeTab === 'sec-recovery' && <RecoveryCenterView />}
              {activeTab === 'sec-governance' && <GovernanceSettings />}
              {activeTab === 'usr-preferences' && <UsersRolesSettings subTab="preferences" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
