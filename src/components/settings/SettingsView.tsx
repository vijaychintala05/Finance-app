import React, { useRef, useState } from 'react';
import { ArrowLeft, Building2, ChevronRight, FileText, Grid2X2, Search, Shield, SlidersHorizontal, X } from 'lucide-react';
import { UsersRolesSettings } from './UsersRolesSettings';
import { IdentitySettings } from './IdentitySettings';
import { GovernanceSettings } from './GovernanceSettings';
import { AuditLogsSettings } from './AuditLogsSettings';
import { OrganizationSettings, type OrganizationSection } from './OrganizationSettings';
import { MfaSettings } from './MfaSettings';
import { useBooks } from '../../context/BooksContext';
import './settings.css';

export type SettingsNavTab = 'overview' | 'org-profile' | 'org-tax' | 'org-invoicing' | 'org-bank' | 'sec-identity' | 'sec-mfa' | 'sec-governance' | 'sec-audit' | 'usr-preferences';
type CategoryId = 'organization' | 'transactions' | 'security' | 'preferences';
const CATEGORIES = [
  { id: 'organization', label: 'Organization', icon: Building2, tone: 'teal' },
  { id: 'transactions', label: 'Transaction Settings', icon: FileText, tone: 'blue' },
  { id: 'security', label: 'Account & Security', icon: Shield, tone: 'rose' },
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
  { id: 'org-profile', label: 'Organization Profile', detail: 'Business name, contact details & website', keywords: 'company legal trade brand industry email phone', category: 'organization', section: 'profile' },
  { id: 'org-tax', label: 'Taxes & Address', detail: 'Tax identifiers & registered address', keywords: 'gst gstin vat pan cin city state postal zip country', category: 'organization', section: 'tax' },
  { id: 'sec-governance', label: 'Workspace Governance', detail: 'Organization identity & access controls', keywords: 'tenant status permissions', category: 'organization' },
  { id: 'org-invoicing', label: 'Invoicing & Fiscal Defaults', detail: 'Payment terms, numbering & financial year', keywords: 'invoice prefix quote estimate purchase order bill notes fiscal month', category: 'transactions', section: 'invoicing' },
  { id: 'org-bank', label: 'Bank Details', detail: 'Beneficiary account & payment instructions', keywords: 'banking settlement wire ifsc swift iban routing', category: 'transactions', section: 'bank' },
  { id: 'sec-identity', label: 'Identity & Password', detail: 'Your account & sign-in credentials', keywords: 'user profile email login password change', category: 'security' },
  { id: 'sec-mfa', label: 'Two-Factor Authentication', detail: 'Authenticator & recovery codes', keywords: '2fa mfa totp enforcement emergency security', category: 'security' },
  { id: 'sec-audit', label: 'Security & Audit Logs', detail: 'Workspace activity & audit history', keywords: 'events actions log records', category: 'security' },
  { id: 'usr-preferences', label: 'Display Preferences', detail: 'Theme, language, date format & timezone', keywords: 'appearance dark light system time zone device', category: 'preferences' },
];

export const SettingsView: React.FC = () => {
  const { currentOrg } = useBooks();
  const [activeTab, setActiveTab] = useState<SettingsNavTab>('overview');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [search, setSearch] = useState('');
  const [organizationDirty, setOrganizationDirty] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const activeItem = ITEMS.find(item => item.id === activeTab);
  const query = search.trim().toLowerCase();
  const visibleItems = ITEMS.filter(item => (category === 'all' || item.category === category) &&
    query.split(/\s+/).every(word => `${item.label} ${item.detail} ${item.keywords} ${item.category}`.toLowerCase().includes(word)));

  const navigate = (tab: SettingsNavTab) => {
    if (tab !== activeTab && organizationDirty && !window.confirm('Discard unsaved organization changes?')) return;
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
        <div className="settings-title"><h1>Settings</h1><span className="settings-org" title={currentOrg.name}><Building2 size={14} aria-hidden="true" />{currentOrg.name}</span></div>
        <div className="settings-search">
          <Search size={17} aria-hidden="true" />
          <input aria-label="Search settings" type="search" placeholder="Search settings" value={search}
            onChange={event => { setSearch(event.target.value); setCategory('all'); }} />
          {search && <button type="button" aria-label="Clear search" title="Clear search" onClick={() => setSearch('')}><X size={16} /></button>}
        </div>
      </header>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings navigation">
          <button type="button" className={`settings-nav-item ${activeTab === 'overview' && category === 'all' ? 'is-active' : ''}`}
            aria-current={activeTab === 'overview' && category === 'all' ? 'page' : undefined}
            onClick={() => { setCategory('all'); navigate('overview'); }}><Grid2X2 size={16} />All Settings</button>
          {CATEGORIES.map(group => {
            const Icon = group.icon;
            return <div key={group.id} className="settings-nav-group">
              {activeTab === 'overview' ? <button type="button" className={`settings-nav-item ${category === group.id ? 'is-active' : ''}`}
                aria-current={category === group.id ? 'page' : undefined}
                onClick={() => { setCategory(group.id); setSearch(''); }}><Icon size={16} />{group.label}</button>
                : <><div className="settings-nav-label">{group.label}</div>{ITEMS.filter(item => item.category === group.id).map(item =>
                  <button type="button" key={item.id} className={`settings-nav-item settings-nav-child ${activeTab === item.id ? 'is-active' : ''}`}
                    aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>{item.label}</button>)}</>}
            </div>;
          })}
        </nav>
        <div className="settings-main">
          {activeTab === 'overview' || query ? <>
            <div className="settings-content-heading">
              <h2 tabIndex={-1} ref={headingRef}>{query ? 'Search Results' : category === 'all' ? 'All Settings' : CATEGORIES.find(group => group.id === category)?.label}</h2>
              <span role="status">{visibleItems.length} {visibleItems.length === 1 ? 'setting' : 'settings'}</span>
            </div>
            {visibleItems.length ? <div className="settings-directory">
              {CATEGORIES.filter(group => visibleItems.some(item => item.category === group.id)).map(group => {
                const Icon = group.icon;
                return <section key={group.id} className="settings-category" aria-labelledby={`category-${group.id}`}>
                  <div className="settings-category-heading"><span className={`settings-category-icon tone-${group.tone}`}><Icon size={19} /></span><h3 id={`category-${group.id}`}>{group.label}</h3></div>
                  <div className="settings-links">{visibleItems.filter(item => item.category === group.id).map(item =>
                    <button type="button" className="settings-link" key={item.id} onClick={() => navigate(item.id)}>
                      <span><span className="settings-link-label">{item.label}</span><span className="settings-link-detail">{item.detail}</span></span><ChevronRight size={16} aria-hidden="true" />
                    </button>)}
                  </div>
                </section>;
              })}
            </div> : <div className="settings-empty"><Search size={28} /><h3>No settings found</h3><p>No matches for "{search}".</p><button type="button" onClick={() => setSearch('')}>Clear search</button></div>}
          </> : <div className="settings-detail-heading">
            <button type="button" aria-label="Back to all settings" title="Back to all settings" onClick={() => { setCategory('all'); navigate('overview'); }}><ArrowLeft size={18} /></button>
            <div><span className="settings-breadcrumb">{CATEGORIES.find(group => group.id === activeItem?.category)?.label}</span><h2 ref={headingRef} tabIndex={-1}>{activeItem?.label}</h2></div>
          </div>}
          {/* Keep the current form mounted during search so drafts are not discarded. */}
          <section className="settings-detail" hidden={activeTab === 'overview' || !!query} aria-label={activeItem?.label}>
            {activeItem?.section && <OrganizationSettings key={`${currentOrg.id}-${activeItem.section}`} section={activeItem.section} onDirtyChange={setOrganizationDirty} />}
            {activeTab === 'sec-identity' && <IdentitySettings />}
            {activeTab === 'sec-mfa' && <MfaSettings />}
            {activeTab === 'sec-governance' && <GovernanceSettings />}
            {activeTab === 'sec-audit' && <AuditLogsSettings />}
            {activeTab === 'usr-preferences' && <UsersRolesSettings subTab="preferences" />}
          </section>
        </div>
      </div>
    </div>
  );
};
