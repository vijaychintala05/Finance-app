import React, { useRef, useState } from 'react';
import {
  Building2,
  Users,
  Shield,
  Sliders,
  Hash,
  Cpu,
  Layers,
  CreditCard,
  ShoppingCart,
  Receipt,
  Search,
  Download,
  Upload,
  RotateCcw,
  Settings as SettingsIcon,
  ChevronRight,
  ArrowLeft,
  Globe,
  MapPin,
  Sparkles,
  UserCheck,
  Calculator,
  FileText,
  Award,
  DollarSign,
  Calendar,
  Lock,
  Bell,
  Monitor,
  ExternalLink,
  FileCode,
  Mail,
  MessageSquare,
  Tag,
  Layout,
  PenTool,
  Zap,
  Activity,
  Box,
  BookOpen,
  Briefcase,
  Clock,
  Send,
  FileSpreadsheet,
  Truck,
  Repeat,
  ArrowDownLeft,
  FileCheck,
  ShoppingBag,
  ArrowUpRight,
  ShieldAlert,
  Percent,
  Grid,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { OrganizationSettings } from './OrganizationSettings';
import { UsersRolesSettings } from './UsersRolesSettings';
import { TaxesComplianceSettings } from './TaxesComplianceSettings';
import { SetupConfigurationsSettings } from './SetupConfigurationsSettings';
import { CustomizationSettings } from './CustomizationSettings';
import { AutomationSettings } from './AutomationSettings';
import { ModuleSettings } from './ModuleSettings';
import { OnlinePaymentsSettings } from './OnlinePaymentsSettings';
import { SalesSettings } from './SalesSettings';
import { PurchasesSettings } from './PurchasesSettings';
import { IdentitySettings } from './IdentitySettings';
import { ActiveSessionsSettings } from './ActiveSessionsSettings';
import { MfaSettings } from './MfaSettings';
import { GovernanceSettings } from './GovernanceSettings';
import { AuditLogsSettings } from './AuditLogsSettings';

export type SettingsNavTab =
  | 'overview'
  // Identity & Security
  | 'sec-identity'
  | 'sec-sessions'
  | 'sec-mfa'
  | 'sec-governance'
  | 'sec-audit'
  // Organization
  | 'org-profile'
  | 'org-branding'
  | 'org-custom-domain'
  | 'org-locations'
  | 'org-ai-integration'
  | 'org-subscription'
  // Users & Roles
  | 'usr-users'
  | 'usr-roles'
  | 'usr-preferences'
  // Taxes & Compliance
  | 'tax-taxes'
  | 'tax-direct-taxes'
  | 'tax-msme'
  // Setup & Configurations
  | 'cfg-general'
  | 'cfg-currencies'
  | 'cfg-payment-terms'
  | 'cfg-opening-balances'
  | 'cfg-reminders'
  | 'cfg-customer-portal'
  | 'cfg-vendor-portal'
  // Customization
  | 'cst-number-series'
  | 'cst-pdf-templates'
  | 'cst-email-notifications'
  | 'cst-sms-notifications'
  | 'cst-reporting-tags'
  | 'cst-web-tabs'
  | 'cst-digital-signature'
  // Automation
  | 'aut-workflow-rules'
  | 'aut-workflow-actions'
  | 'aut-workflow-logs'
  // Module Settings
  | 'mod-general'
  | 'mod-customers-vendors'
  | 'mod-items'
  | 'mod-accountant'
  | 'mod-projects'
  | 'mod-timesheet'
  // Online Payments
  | 'pay-customer'
  | 'pay-vendor'
  // Sales
  | 'sal-quotes'
  | 'sal-orders'
  | 'sal-delivery-challans'
  | 'sal-invoices'
  | 'sal-recurring-invoices'
  | 'sal-payments-received'
  | 'sal-credit-notes'
  | 'sal-delivery-notes'
  | 'sal-packing-slips'
  // Purchases
  | 'pur-expenses'
  | 'pur-purchase-orders'
  | 'pur-bills'
  | 'pur-payments-made'
  | 'pur-vendor-credits';

interface NavItem {
  id: SettingsNavTab;
  label: string;
  icon: React.FC<{ className?: string }>;
}

interface NavCategory {
  title: string;
  items: NavItem[];
}

const SETTINGS_NAV: NavCategory[] = [
  {
    title: 'Identity, Security & Governance',
    items: [
      { id: 'sec-identity', label: 'Platform Identity Account', icon: UserCheck },
      { id: 'sec-sessions', label: 'Active Sessions & Devices', icon: Monitor },
      { id: 'sec-mfa', label: 'Multi-Factor Auth (MFA)', icon: ShieldAlert },
      { id: 'sec-governance', label: 'Organization Governance', icon: Building2 },
      { id: 'sec-audit', label: 'Security & Audit Logs', icon: Activity },
    ],
  },
  {
    title: 'Organization',
    items: [
      { id: 'org-profile', label: 'Profile', icon: Building2 },
      { id: 'org-branding', label: 'Branding', icon: Sparkles },
      { id: 'org-custom-domain', label: 'Custom Domain', icon: Globe },
      { id: 'org-locations', label: 'Locations', icon: MapPin },
      { id: 'org-ai-integration', label: 'AI Integration', icon: Sparkles },
      { id: 'org-subscription', label: 'Manage Subscription', icon: CreditCard },
    ],
  },
  {
    title: 'Users & Roles',
    items: [
      { id: 'usr-users', label: 'Users', icon: Users },
      { id: 'usr-roles', label: 'Roles', icon: Shield },
      { id: 'usr-preferences', label: 'User Preferences', icon: UserCheck },
    ],
  },
  {
    title: 'Taxes & Compliance',
    items: [
      { id: 'tax-taxes', label: 'Taxes', icon: Calculator },
      { id: 'tax-direct-taxes', label: 'Direct Taxes', icon: FileText },
      { id: 'tax-msme', label: 'MSME Settings', icon: Award },
    ],
  },
  {
    title: 'Setup & Configurations',
    items: [
      { id: 'cfg-general', label: 'General', icon: Sliders },
      { id: 'cfg-currencies', label: 'Currencies', icon: DollarSign },
      { id: 'cfg-payment-terms', label: 'Payment Terms', icon: Calendar },
      { id: 'cfg-opening-balances', label: 'Opening Balances', icon: Lock },
      { id: 'cfg-reminders', label: 'Reminders', icon: Bell },
      { id: 'cfg-customer-portal', label: 'Customer Portal', icon: Monitor },
      { id: 'cfg-vendor-portal', label: 'Vendor Portal', icon: ExternalLink },
    ],
  },
  {
    title: 'Customization',
    items: [
      { id: 'cst-number-series', label: 'Transaction Number Series', icon: Hash },
      { id: 'cst-pdf-templates', label: 'PDF Templates', icon: FileCode },
      { id: 'cst-email-notifications', label: 'Email Notifications', icon: Mail },
      { id: 'cst-sms-notifications', label: 'SMS Notifications', icon: MessageSquare },
      { id: 'cst-reporting-tags', label: 'Reporting Tags', icon: Tag },
      { id: 'cst-web-tabs', label: 'Web Tabs', icon: Layout },
      { id: 'cst-digital-signature', label: 'Digital Signature', icon: PenTool },
    ],
  },
  {
    title: 'Automation',
    items: [
      { id: 'aut-workflow-rules', label: 'Workflow Rules', icon: Cpu },
      { id: 'aut-workflow-actions', label: 'Workflow Actions', icon: Zap },
      { id: 'aut-workflow-logs', label: 'Workflow Logs', icon: Activity },
    ],
  },
  {
    title: 'Module Settings',
    items: [
      { id: 'mod-general', label: 'General', icon: Layers },
      { id: 'mod-customers-vendors', label: 'Customers and Vendors', icon: Users },
      { id: 'mod-items', label: 'Items', icon: Box },
      { id: 'mod-accountant', label: 'Accountant', icon: BookOpen },
      { id: 'mod-projects', label: 'Projects', icon: Briefcase },
      { id: 'mod-timesheet', label: 'Timesheet', icon: Clock },
    ],
  },
  {
    title: 'Online Payments',
    items: [
      { id: 'pay-customer', label: 'Customer Payments', icon: CreditCard },
      { id: 'pay-vendor', label: 'Vendor Payments', icon: Send },
    ],
  },
  {
    title: 'Sales',
    items: [
      { id: 'sal-quotes', label: 'Quotes', icon: FileSpreadsheet },
      { id: 'sal-orders', label: 'Sales Orders', icon: ShoppingCart },
      { id: 'sal-delivery-challans', label: 'Delivery Challans', icon: Truck },
      { id: 'sal-invoices', label: 'Invoices', icon: FileText },
      { id: 'sal-recurring-invoices', label: 'Recurring Invoices', icon: Repeat },
      { id: 'sal-payments-received', label: 'Payments Received', icon: ArrowDownLeft },
      { id: 'sal-credit-notes', label: 'Credit Notes', icon: FileCheck },
      { id: 'sal-delivery-notes', label: 'Delivery Notes', icon: Truck },
      { id: 'sal-packing-slips', label: 'Packing Slips', icon: Box },
    ],
  },
  {
    title: 'Purchases',
    items: [
      { id: 'pur-expenses', label: 'Expenses', icon: Receipt },
      { id: 'pur-purchase-orders', label: 'Purchase Orders', icon: ShoppingBag },
      { id: 'pur-bills', label: 'Bills', icon: FileText },
      { id: 'pur-payments-made', label: 'Payments Made', icon: ArrowUpRight },
      { id: 'pur-vendor-credits', label: 'Vendor Credits', icon: ShieldAlert },
    ],
  },
];

export const SettingsView: React.FC = () => {
  const { resetToDemoData, exportDataJSON, importDataJSON, clearAllData, loadSampleData } = useBooks();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<SettingsNavTab>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        const ok = importDataJSON(content);
        if (ok) {
          alert('Data backup successfully restored!');
        } else {
          alert('Failed to import JSON data. Please check file format.');
        }
      }
    };
    reader.readAsText(file);
  };

  const currentActiveItem = SETTINGS_NAV.flatMap((c) => c.items).find((i) => i.id === activeTab);
  const currentCategory = SETTINGS_NAV.find((c) => c.items.some((i) => i.id === activeTab));

  const filterMatches = (text: string) => {
    if (!searchTerm.trim()) return true;
    return text.toLowerCase().includes(searchTerm.toLowerCase());
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto text-xs min-h-screen">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-3">
          {activeTab !== 'overview' && (
            <button
              onClick={() => setActiveTab('overview')}
              className="bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 p-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1 font-bold text-xs"
              title="Return to Settings Overview"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">All Settings</span>
            </button>
          )}

          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <SettingsIcon className="w-5 h-5 text-blue-600" />
              <span>
                {activeTab === 'overview'
                  ? 'Settings'
                  : `${currentCategory?.title || 'Settings'} / ${currentActiveItem?.label || ''}`}
              </span>
            </h2>
            <p className="text-[11px] text-slate-500">
              {activeTab === 'overview'
                ? 'Configure your organization preferences, taxes, workflows, and module rules'
                : `Manage and update ${currentActiveItem?.label.toLowerCase() || 'settings'}`}
            </p>
          </div>
        </div>

        {/* Global Action Tools */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => exportDataJSON()}
            className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
            title="Export full database backup"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden md:inline">Export Backup</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
            title="Restore from JSON backup"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden md:inline">Restore</span>
          </button>
          <button
            onClick={() => {
              if (confirm('Clear all clients, invoices, expenses & transactional records to start completely fresh from scratch?')) {
                clearAllData();
              }
            }}
            className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
            title="Clear all records to start fresh from scratch"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
            <span className="hidden md:inline">Clear All Data (Start Fresh)</span>
          </button>
          <button
            onClick={() => {
              if (confirm('Load sample demo records (clients, invoices, expenses) into your workspace?')) {
                loadSampleData();
              }
            }}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
            title="Load sample demo records"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden md:inline">Load Sample Data</span>
          </button>
        </div>
      </div>

      {/* OVERVIEW HUB VIEW (Exact layout matching user screenshot) */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-fade-in">
          {/* Search Box */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search settings (e.g. Taxes, Invoices, Users)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs font-medium"
            />
          </div>

          {/* SECTION 1: Organization Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 tracking-tight">
              Organization Settings
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
              {/* Card 0: Identity & Governance */}
              <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs space-y-3 min-h-[260px] flex flex-col">
                <div className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 font-bold text-xs border border-indigo-200 dark:border-indigo-800/80 w-fit">
                  <ShieldAlert className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Identity & Security</span>
                </div>
                <div className="space-y-1 pt-1 flex-1">
                  {[
                    { id: 'sec-identity', label: 'Platform Identity Account' },
                    { id: 'sec-sessions', label: 'Active Sessions & Devices' },
                    { id: 'sec-mfa', label: 'Multi-Factor Auth (MFA)' },
                    { id: 'sec-governance', label: 'Organization Governance' },
                    { id: 'sec-audit', label: 'Security & Audit Logs' },
                  ]
                    .filter((i) => filterMatches(i.label))
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as SettingsNavTab)}
                        className="w-full text-left py-1.5 px-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium text-[12px] block cursor-pointer"
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              </div>

              {/* Card 1: Organization */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-3 min-h-[260px] flex flex-col">
                <div className="bg-emerald-50/80 text-emerald-800 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 font-bold text-xs border border-emerald-100/80 w-fit">
                  <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Organization</span>
                </div>
                <div className="space-y-1 pt-1 flex-1">
                  {[
                    { id: 'org-profile', label: 'Profile' },
                    { id: 'org-branding', label: 'Branding' },
                    { id: 'org-custom-domain', label: 'Custom Domain' },
                    { id: 'org-locations', label: 'Locations' },
                    { id: 'org-ai-integration', label: 'AI Integration' },
                    { id: 'org-subscription', label: 'Manage Subscription' },
                  ]
                    .filter((i) => filterMatches(i.label))
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as SettingsNavTab)}
                        className="w-full text-left py-1.5 px-2 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors font-normal text-[12px] block cursor-pointer"
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              </div>

              {/* Card 2: Users & Roles + Taxes & Compliance */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-3 min-h-[260px] flex flex-col">
                {/* Users & Roles Section */}
                <div>
                  <div className="bg-rose-50/80 text-rose-800 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 font-bold text-xs border border-rose-100/80 w-fit mb-2">
                    <Users className="w-3.5 h-3.5 text-rose-600" />
                    <span>Users & Roles</span>
                  </div>
                  <div className="space-y-1">
                    {[
                      { id: 'usr-users', label: 'Users' },
                      { id: 'usr-roles', label: 'Roles' },
                      { id: 'usr-preferences', label: 'User Preferences' },
                    ]
                      .filter((i) => filterMatches(i.label))
                      .map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setActiveTab(item.id as SettingsNavTab)}
                          className="w-full text-left py-1.5 px-2 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors font-normal text-[12px] block cursor-pointer"
                        >
                          {item.label}
                        </button>
                      ))}
                  </div>
                </div>

                {/* Taxes & Compliance Badge */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="bg-blue-50/80 text-blue-800 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 font-bold text-xs border border-blue-100/80 w-fit mb-2">
                    <Percent className="w-3.5 h-3.5 text-blue-600" />
                    <span>Taxes & Compliance</span>
                  </div>
                  <div className="space-y-1">
                    {[
                      { id: 'tax-taxes', label: 'Taxes' },
                      { id: 'tax-direct-taxes', label: 'Direct Taxes' },
                      { id: 'tax-msme', label: 'MSME Settings' },
                    ]
                      .filter((i) => filterMatches(i.label))
                      .map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setActiveTab(item.id as SettingsNavTab)}
                          className="w-full text-left py-1.5 px-2 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors font-normal text-[12px] block cursor-pointer"
                        >
                          {item.label}
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              {/* Card 3: Setup & Configurations */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-3 min-h-[260px] flex flex-col">
                <div className="bg-amber-50/80 text-amber-800 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 font-bold text-xs border border-amber-100/80 w-fit">
                  <Sliders className="w-3.5 h-3.5 text-amber-600" />
                  <span>Setup & Configurations</span>
                </div>
                <div className="space-y-1 pt-1 flex-1">
                  {[
                    { id: 'cfg-general', label: 'General' },
                    { id: 'cfg-currencies', label: 'Currencies' },
                    { id: 'cfg-payment-terms', label: 'Payment Terms' },
                    { id: 'cfg-opening-balances', label: 'Opening Balances' },
                    { id: 'cfg-reminders', label: 'Reminders' },
                    { id: 'cfg-customer-portal', label: 'Customer Portal' },
                    { id: 'cfg-vendor-portal', label: 'Vendor Portal' },
                  ]
                    .filter((i) => filterMatches(i.label))
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as SettingsNavTab)}
                        className="w-full text-left py-1.5 px-2 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors font-normal text-[12px] block cursor-pointer"
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              </div>

              {/* Card 4: Customization */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-3 min-h-[260px] flex flex-col">
                <div className="bg-amber-50/80 text-amber-800 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 font-bold text-xs border border-amber-100/80 w-fit">
                  <Tag className="w-3.5 h-3.5 text-amber-600" />
                  <span>Customization</span>
                </div>
                <div className="space-y-1 pt-1 flex-1">
                  {[
                    { id: 'cst-number-series', label: 'Transaction Number Series' },
                    { id: 'cst-pdf-templates', label: 'PDF Templates' },
                    { id: 'cst-email-notifications', label: 'Email Notifications' },
                    { id: 'cst-sms-notifications', label: 'SMS Notifications' },
                    { id: 'cst-reporting-tags', label: 'Reporting Tags' },
                    { id: 'cst-web-tabs', label: 'Web Tabs' },
                    { id: 'cst-digital-signature', label: 'Digital Signature' },
                  ]
                    .filter((i) => filterMatches(i.label))
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as SettingsNavTab)}
                        className="w-full text-left py-1.5 px-2 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors font-normal text-[12px] block cursor-pointer"
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              </div>

              {/* Card 5: Automation */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-3 min-h-[260px] flex flex-col">
                <div className="bg-rose-50/80 text-rose-800 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 font-bold text-xs border border-rose-100/80 w-fit">
                  <Cpu className="w-3.5 h-3.5 text-rose-600" />
                  <span>Automation</span>
                </div>
                <div className="space-y-1 pt-1 flex-1">
                  {[
                    { id: 'aut-workflow-rules', label: 'Workflow Rules' },
                    { id: 'aut-workflow-actions', label: 'Workflow Actions' },
                    { id: 'aut-workflow-logs', label: 'Workflow Logs' },
                  ]
                    .filter((i) => filterMatches(i.label))
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as SettingsNavTab)}
                        className="w-full text-left py-1.5 px-2 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors font-normal text-[12px] block cursor-pointer"
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Module Settings */}
          <div className="space-y-4 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 tracking-tight">
              Module Settings
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
              {/* Card 1: General */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-3 min-h-[200px] flex flex-col">
                <div className="bg-emerald-50/80 text-emerald-800 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 font-bold text-xs border border-emerald-100/80 w-fit">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  <span>General</span>
                </div>
                <div className="space-y-1 pt-1 flex-1">
                  {[
                    { id: 'mod-customers-vendors', label: 'Customers and Vendors' },
                    { id: 'mod-items', label: 'Items' },
                    { id: 'mod-accountant', label: 'Accountant' },
                    { id: 'mod-projects', label: 'Projects' },
                  ]
                    .filter((i) => filterMatches(i.label))
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as SettingsNavTab)}
                        className="w-full text-left py-1.5 px-2 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors font-normal text-[12px] block cursor-pointer"
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              </div>

              {/* Card 2: Online Payments */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-3 min-h-[200px] flex flex-col">
                <div className="bg-amber-50/80 text-amber-800 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 font-bold text-xs border border-amber-100/80 w-fit">
                  <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                  <span>Online Payments</span>
                </div>
                <div className="space-y-1 pt-1 flex-1">
                  {[
                    { id: 'pay-customer', label: 'Customer Payments' },
                    { id: 'pay-vendor', label: 'Vendor Payments' },
                  ]
                    .filter((i) => filterMatches(i.label))
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as SettingsNavTab)}
                        className="w-full text-left py-1.5 px-2 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors font-normal text-[12px] block cursor-pointer"
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              </div>

              {/* Card 3: Sales */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-3 min-h-[200px] flex flex-col">
                <div className="bg-emerald-50/80 text-emerald-800 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 font-bold text-xs border border-emerald-100/80 w-fit">
                  <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Sales</span>
                </div>
                <div className="space-y-1 pt-1 flex-1">
                  {[
                    { id: 'sal-quotes', label: 'Quotes' },
                    { id: 'sal-orders', label: 'Sales Orders' },
                    { id: 'sal-delivery-challans', label: 'Delivery Challans' },
                    { id: 'sal-invoices', label: 'Invoices' },
                  ]
                    .filter((i) => filterMatches(i.label))
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as SettingsNavTab)}
                        className="w-full text-left py-1.5 px-2 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors font-normal text-[12px] block cursor-pointer"
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              </div>

              {/* Card 4: Purchases */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-3 min-h-[200px] flex flex-col">
                <div className="bg-emerald-50/80 text-emerald-800 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 font-bold text-xs border border-emerald-100/80 w-fit">
                  <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Purchases</span>
                </div>
                <div className="space-y-1 pt-1 flex-1">
                  {[
                    { id: 'pur-expenses', label: 'Expenses' },
                    { id: 'pur-purchase-orders', label: 'Purchase Orders' },
                    { id: 'pur-bills', label: 'Bills' },
                    { id: 'pur-payments-made', label: 'Payments Made' },
                  ]
                    .filter((i) => filterMatches(i.label))
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as SettingsNavTab)}
                        className="w-full text-left py-1.5 px-2 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors font-normal text-[12px] block cursor-pointer"
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL VIEW WITH LEFT SIDEBAR (When a setting tab is selected) */}
      {activeTab !== 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Mobile Navigation Header & Selector (Visible on mobile/tablet < lg) */}
          <div className="lg:hidden bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  setActiveTab('overview');
                  setMobileNavOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer border border-slate-200 shrink-0"
              >
                <Grid className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>← All Settings Hub</span>
              </button>

              <button
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
                className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs flex items-center gap-1.5 cursor-pointer border border-blue-200/80 shrink-0"
              >
                <Sliders className="w-3.5 h-3.5 text-blue-600" />
                <span>{mobileNavOpen ? 'Close Menu' : 'All Tabs (45)'}</span>
              </button>
            </div>

            {/* Quick 1-Tap Setting Selector */}
            <div className="space-y-1">
              <label htmlFor="mobile-setting-select" className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider block">
                Current Active Setting
              </label>
              <div className="relative">
                <select
                  id="mobile-setting-select"
                  value={activeTab}
                  onChange={(e) => {
                    setActiveTab(e.target.value as SettingsNavTab);
                    setMobileNavOpen(false);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-lg py-2 pl-3 pr-8 focus:outline-none focus:border-blue-600 cursor-pointer appearance-none truncate shadow-2xs"
                >
                  {SETTINGS_NAV.map((cat) => (
                    <optgroup key={cat.title} label={`── ${cat.title} ──`}>
                      {cat.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="absolute right-2.5 top-2.5 pointer-events-none text-slate-500">
                  <ChevronRight className="w-4 h-4 rotate-90" />
                </div>
              </div>
            </div>

            {/* Expanded Full Settings List for Mobile (Collapsible) */}
            {mobileNavOpen && (
              <div className="space-y-4 pt-3 border-t border-slate-100 max-h-[55vh] overflow-y-auto pr-1">
                {SETTINGS_NAV.map((cat) => (
                  <div key={cat.title} className="space-y-1">
                    <h4 className="px-2 text-[10px] uppercase tracking-wider font-extrabold text-slate-400 border-b border-slate-100 pb-1">
                      {cat.title}
                    </h4>
                    <div className="space-y-0.5">
                      {cat.items.map((item) => {
                        const IconComponent = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setActiveTab(item.id);
                              setMobileNavOpen(false);
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded-lg font-bold flex items-center justify-between transition-colors cursor-pointer text-xs ${
                              isActive
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <IconComponent
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isActive ? 'text-white' : 'text-slate-500'
                                }`}
                              />
                              <span className="truncate">{item.label}</span>
                            </div>
                            {isActive && <ChevronRight className="w-3.5 h-3.5 shrink-0 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop Left Navigation Sidebar (Visible only on lg+) */}
          <div className="hidden lg:block lg:col-span-3 bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-3 sticky top-4 max-h-[calc(100vh-100px)] overflow-y-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 font-bold flex items-center gap-2 transition-colors cursor-pointer border border-slate-200/70"
            >
              <Grid className="w-4 h-4 text-blue-600 shrink-0" />
              <span>← All Settings Hub</span>
            </button>

            <div className="space-y-4 pt-1">
              {SETTINGS_NAV.map((cat) => (
                <div key={cat.title} className="space-y-1">
                  <h4 className="px-2 text-[10px] uppercase tracking-wider font-extrabold text-slate-400 border-b border-slate-100 pb-1">
                    {cat.title}
                  </h4>
                  <div className="space-y-0.5">
                    {cat.items.map((item) => {
                      const IconComponent = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveTab(item.id)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg font-bold flex items-center justify-between transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <IconComponent
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isActive ? 'text-white' : 'text-slate-500'
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {isActive && <ChevronRight className="w-3.5 h-3.5 shrink-0 text-white" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Active Content Panel */}
          <div className="lg:col-span-9 min-w-0 w-full">
            {/* Identity & Security Subtabs */}
            {activeTab.startsWith('sec-') && (
              <>
                {activeTab === 'sec-identity' && <IdentitySettings />}
                {activeTab === 'sec-sessions' && <ActiveSessionsSettings />}
                {activeTab === 'sec-mfa' && <MfaSettings />}
                {activeTab === 'sec-governance' && <GovernanceSettings />}
                {activeTab === 'sec-audit' && <AuditLogsSettings />}
              </>
            )}

            {/* Organization Subtabs */}
            {activeTab.startsWith('org-') && (
              <OrganizationSettings
                subTab={
                  activeTab === 'org-profile'
                    ? 'profile'
                    : activeTab === 'org-branding'
                    ? 'branding'
                    : activeTab === 'org-custom-domain'
                    ? 'custom-domain'
                    : activeTab === 'org-locations'
                    ? 'locations'
                    : activeTab === 'org-ai-integration'
                    ? 'ai-integration'
                    : 'subscription'
                }
              />
            )}

            {/* Users & Roles Subtabs */}
            {activeTab.startsWith('usr-') && (
              <UsersRolesSettings
                subTab={
                  activeTab === 'usr-users'
                    ? 'users'
                    : activeTab === 'usr-roles'
                    ? 'roles'
                    : 'preferences'
                }
              />
            )}

            {/* Taxes & Compliance Subtabs */}
            {activeTab.startsWith('tax-') && (
              <TaxesComplianceSettings
                subTab={
                  activeTab === 'tax-taxes'
                    ? 'taxes'
                    : activeTab === 'tax-direct-taxes'
                    ? 'direct-taxes'
                    : 'msme'
                }
              />
            )}

            {/* Setup & Configurations Subtabs */}
            {activeTab.startsWith('cfg-') && (
              <SetupConfigurationsSettings
                subTab={
                  activeTab === 'cfg-general'
                    ? 'general'
                    : activeTab === 'cfg-currencies'
                    ? 'currencies'
                    : activeTab === 'cfg-payment-terms'
                    ? 'payment-terms'
                    : activeTab === 'cfg-opening-balances'
                    ? 'opening-balances'
                    : activeTab === 'cfg-reminders'
                    ? 'reminders'
                    : activeTab === 'cfg-customer-portal'
                    ? 'customer-portal'
                    : 'vendor-portal'
                }
              />
            )}

            {/* Customization Subtabs */}
            {activeTab.startsWith('cst-') && (
              <CustomizationSettings
                subTab={
                  activeTab === 'cst-number-series'
                    ? 'number-series'
                    : activeTab === 'cst-pdf-templates'
                    ? 'pdf-templates'
                    : activeTab === 'cst-email-notifications'
                    ? 'email-notifications'
                    : activeTab === 'cst-sms-notifications'
                    ? 'sms-notifications'
                    : activeTab === 'cst-reporting-tags'
                    ? 'reporting-tags'
                    : activeTab === 'cst-web-tabs'
                    ? 'web-tabs'
                    : 'digital-signature'
                }
              />
            )}

            {/* Automation Subtabs */}
            {activeTab.startsWith('aut-') && (
              <AutomationSettings
                subTab={
                  activeTab === 'aut-workflow-rules'
                    ? 'workflow-rules'
                    : activeTab === 'aut-workflow-actions'
                    ? 'workflow-actions'
                    : 'workflow-logs'
                }
              />
            )}

            {/* Module Settings Subtabs */}
            {activeTab.startsWith('mod-') && (
              <ModuleSettings
                subTab={
                  activeTab === 'mod-general'
                    ? 'mod-general'
                    : activeTab === 'mod-customers-vendors'
                    ? 'mod-customers-vendors'
                    : activeTab === 'mod-items'
                    ? 'mod-items'
                    : activeTab === 'mod-accountant'
                    ? 'mod-accountant'
                    : activeTab === 'mod-projects'
                    ? 'mod-projects'
                    : 'mod-timesheet'
                }
              />
            )}

            {/* Online Payments Subtabs */}
            {activeTab.startsWith('pay-') && (
              <OnlinePaymentsSettings
                subTab={
                  activeTab === 'pay-customer' ? 'customer-payments' : 'vendor-payments'
                }
              />
            )}

            {/* Sales Subtabs */}
            {activeTab.startsWith('sal-') && (
              <SalesSettings
                subTab={
                  activeTab === 'sal-quotes'
                    ? 'sales-quotes'
                    : activeTab === 'sal-orders'
                    ? 'sales-orders'
                    : activeTab === 'sal-delivery-challans'
                    ? 'sales-delivery-challans'
                    : activeTab === 'sal-invoices'
                    ? 'sales-invoices'
                    : activeTab === 'sal-recurring-invoices'
                    ? 'sales-recurring-invoices'
                    : activeTab === 'sal-payments-received'
                    ? 'sales-payments-received'
                    : activeTab === 'sal-credit-notes'
                    ? 'sales-credit-notes'
                    : activeTab === 'sal-delivery-notes'
                    ? 'sales-delivery-notes'
                    : 'sales-packing-slips'
                }
              />
            )}

            {/* Purchases Subtabs */}
            {activeTab.startsWith('pur-') && (
              <PurchasesSettings
                subTab={
                  activeTab === 'pur-expenses'
                    ? 'purchases-expenses'
                    : activeTab === 'pur-purchase-orders'
                    ? 'purchases-purchase-orders'
                    : activeTab === 'pur-bills'
                    ? 'purchases-bills'
                    : activeTab === 'pur-payments-made'
                    ? 'purchases-payments-made'
                    : 'purchases-vendor-credits'
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
