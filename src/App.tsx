import React, { Suspense, useState } from 'react';
import { BooksProvider } from './context/BooksContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { CreateOrganizationWizardModal } from './components/organization/CreateOrganizationWizardModal';
import { OrganizationSwitcherModal } from './components/organization/OrganizationSwitcherModal';
import { CapabilityUnavailable } from './components/common/CapabilityUnavailable';
import { useFinanceCapabilities } from './capabilities/useFinanceCapabilities';
import { getRequiredFinanceCapability } from './capabilities/financeCapabilityRegistry';
import { buildFinanceHash, parseFinanceLocation, type FinanceHashRoute } from './navigation/financeRoute';
import { DevModeBanner } from './components/layout/DevModeBanner';
import { useBooks } from './context/BooksContext';
import { useOptionalAuth } from './context/AuthContext';
import { useItemPermissions } from './permissions/useItemPermissions';
import type { NavigationTab } from './types';

const lazyNamed = <T extends React.ComponentType<any>>(loader: () => Promise<any>, name: string) =>
  React.lazy(async () => ({ default: (await loader())[name] as T }));

const MasterItemsView = lazyNamed(() => import('./components/items/MasterItemsView'), 'MasterItemsView');
const DashboardView = lazyNamed(() => import('./components/dashboard/DashboardView'), 'DashboardView');
const BankingView = lazyNamed(() => import('./components/banking/BankingView'), 'BankingView');
const ProjectsView = lazyNamed(() => import('./components/projects/ProjectsView'), 'ProjectsView');
const ClientsView = lazyNamed(() => import('./components/clients/ClientsView'), 'ClientsView');
const InvoicesView = lazyNamed(() => import('./components/invoices/InvoicesView'), 'InvoicesView');
const EstimatesView = lazyNamed(() => import('./components/invoices/EstimatesView'), 'EstimatesView');
const ExpensesView = lazyNamed(() => import('./components/expenses/ExpensesView'), 'ExpensesView');
const AccountingView = lazyNamed(() => import('./components/accounting/AccountingView'), 'AccountingView');
const ReportsView = lazyNamed(() => import('./components/reports/ReportsView'), 'ReportsView');
const SettingsView = lazyNamed(() => import('./components/settings/SettingsView'), 'SettingsView');
const SalespersonsView = lazyNamed(() => import('./components/salespersons/SalespersonsView'), 'SalespersonsView');
const PurchasesOverview = lazyNamed(() => import('./components/purchases/PurchasesOverview'), 'PurchasesOverview');
const VendorsView = lazyNamed(() => import('./components/purchases/VendorsView'), 'VendorsView');
const PurchaseOrdersView = lazyNamed(() => import('./components/purchases/PurchaseOrdersView'), 'PurchaseOrdersView');
const BillsView = lazyNamed(() => import('./components/purchases/BillsView'), 'BillsView');
const SalesOverview = lazyNamed(() => import('./components/sales/SalesOverview'), 'SalesOverview');
const SalesOrdersView = lazyNamed(() => import('./components/sales/SalesOrdersView'), 'SalesOrdersView');
const RecurringTransactionsView = lazyNamed(() => import('./components/recurring/RecurringTransactionsView'), 'RecurringTransactionsView');
const DeliveryChallansView = lazyNamed(() => import('./components/sales/DeliveryChallansView'), 'DeliveryChallansView');
const PaymentsReceivedView = lazyNamed(() => import('./components/sales/PaymentsReceivedView'), 'PaymentsReceivedView');
const FixedAssetsView = lazyNamed(() => import('./components/accounting/FixedAssetsView'), 'FixedAssetsView');
const PeriodCloseView = lazyNamed(() => import('./components/accounting/PeriodCloseView'), 'PeriodCloseView');
const GSTComplianceView = lazyNamed(() => import('./components/accounting/GSTComplianceView'), 'GSTComplianceView');
const TeamAccessView = lazyNamed(() => import('./components/settings/TeamAccessView'), 'TeamAccessView');
const RecoveryCenterView = lazyNamed(() => import('./components/settings/RecoveryCenterView'), 'RecoveryCenterView');
const SettlementWorkspace = lazyNamed(() => import('./components/accounting/SettlementWorkspace'), 'SettlementWorkspace');
const SecurityCenterView = lazyNamed(() => import('./components/security/SecurityCenterView'), 'SecurityCenterView');
const DocumentInboxView = lazyNamed(() => import('./components/inbox/DocumentInboxView'), 'DocumentInboxView');
const CustomerPortalView = lazyNamed(() => import('./components/portal/CustomerPortalView'), 'CustomerPortalView');
const DataMigrationModal = lazyNamed(() => import('./components/migration/DataMigrationModal'), 'DataMigrationModal');

const parseHashRoute = (): FinanceHashRoute => {
  if (typeof window === 'undefined') return { tab: 'dashboard' };
  return parseFinanceLocation(window.location.hash, window.location.search);
};

function MainAppLayout() {
  const financeCapabilities = useFinanceCapabilities();
  const { currentOrg } = useBooks();
  const auth = useOptionalAuth();
  const itemPermissions = useItemPermissions(currentOrg.id, Boolean(auth?.user && !auth.loading));
  const canViewItems = itemPermissions.organizationId === currentOrg.id && itemPermissions.actions.itemsView;
  const [activeTab, setActiveTab] = useState(() => parseHashRoute().tab);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isOrgWizardOpen, setIsOrgWizardOpen] = useState(false);
  const [isOrgSwitcherOpen, setIsOrgSwitcherOpen] = useState(false);
  const [searchOriginOrgId, setSearchOriginOrgId] = useState<string | null>(null);
  const [searchNavigationError, setSearchNavigationError] = useState<string | null>(null);
  const routeOrgIdRef = React.useRef(currentOrg.id);

  // Quick Create Modal Flags
  const [autoOpenClientModal, setAutoOpenClientModal] = useState(false);
  const [autoOpenEstimateModal, setAutoOpenEstimateModal] = useState(false);
  const [autoOpenSalesOrderModal, setAutoOpenSalesOrderModal] = useState(false);
  const [autoOpenInvoiceModal, setAutoOpenInvoiceModal] = useState(false);
  const [autoOpenPaymentReceivedModal, setAutoOpenPaymentReceivedModal] = useState(false);
  const [autoOpenCreditNoteModal, setAutoOpenCreditNoteModal] = useState(false);
  const [autoOpenVendorModal, setAutoOpenVendorModal] = useState(false);
  const [autoOpenPurchaseOrderModal, setAutoOpenPurchaseOrderModal] = useState(false);
  const [autoOpenExpenseModal, setAutoOpenExpenseModal] = useState(false);
  const [autoOpenBillModal, setAutoOpenBillModal] = useState(false);
  const [autoOpenPaymentMadeModal, setAutoOpenPaymentMadeModal] = useState(false);
  const [autoOpenVendorCreditModal, setAutoOpenVendorCreditModal] = useState(false);
  const [autoOpenJournalModal, setAutoOpenJournalModal] = useState(false);

  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(() => parseHashRoute().entityId);

  React.useEffect(() => {
    if (routeOrgIdRef.current === currentOrg.id) return;
    routeOrgIdRef.current = currentOrg.id;
    setSearchOriginOrgId(null);
    setSearchNavigationError(null);
    setSelectedEntityId(undefined);
    const route = parseHashRoute();
    if (route.entityId || route.back) window.history.replaceState(null, '', buildFinanceHash({ ...route, entityId: undefined, back: undefined }));
  }, [currentOrg.id]);

  React.useEffect(() => {
    const handleHashChange = () => {
      const { tab, entityId } = parseHashRoute();
      setActiveTab(tab);
      setSelectedEntityId(entityId);
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  const activeRoute = parseHashRoute();
  const closeSelectedEntity = () => {
    setSelectedEntityId(undefined);
    if (typeof window === 'undefined' || !activeRoute.entityId) return;
    window.history.replaceState(null, '', buildFinanceHash({ ...activeRoute, entityId: undefined }));
  };
  const returnToOrigin = () => {
    const origin = activeRoute.back;
    if (!origin || (searchOriginOrgId && searchOriginOrgId !== currentOrg.id)) return;
    const hash = buildFinanceHash(origin);
    setActiveTab(origin.tab);
    setSelectedEntityId(origin.entityId);
    window.history.pushState(null, '', hash);
  };
  const handleNavigate = (tab: string, options?: { autoCreate?: boolean; entityId?: string }) => {
    setSelectedEntityId(options?.entityId);

    if (tab === 'clients' && options?.autoCreate) setAutoOpenClientModal(true);
    if (tab === 'estimates' && options?.autoCreate) setAutoOpenEstimateModal(true);
    if (tab === 'sales_orders' && options?.autoCreate) setAutoOpenSalesOrderModal(true);
    if (tab === 'invoices' && options?.autoCreate) setAutoOpenInvoiceModal(true);
    if (tab === 'payments_received' && options?.autoCreate) setAutoOpenPaymentReceivedModal(true);
    if (tab === 'credit_notes' && options?.autoCreate) setAutoOpenCreditNoteModal(true);
    if (tab === 'vendors' && options?.autoCreate) setAutoOpenVendorModal(true);
    if (tab === 'purchase_orders' && options?.autoCreate) setAutoOpenPurchaseOrderModal(true);
    if (tab === 'expenses' && options?.autoCreate) setAutoOpenExpenseModal(true);
    if (tab === 'bills' && options?.autoCreate) setAutoOpenBillModal(true);
    if (tab === 'payments_made' && options?.autoCreate) setAutoOpenPaymentMadeModal(true);
    if (tab === 'vendor_credits' && options?.autoCreate) setAutoOpenVendorCreditModal(true);
    if ((tab === 'journals' || tab === 'accounting') && options?.autoCreate) setAutoOpenJournalModal(true);

    if (typeof window !== 'undefined') {
      const targetHash = buildFinanceHash({ tab: tab as NavigationTab, entityId: options?.entityId });
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }
    }

    setActiveTab(tab);
  };

  const handleSearchResult = (result: { tab: NavigationTab; entityId: string; organizationId: string }) => {
    if (result.organizationId !== currentOrg.id || !result.entityId || result.entityId.length > 200) return;
    const origin = activeRoute.tab === 'customer_portal' || routeOrgIdRef.current !== currentOrg.id || (activeRoute.tab === 'reports' && !activeRoute.report) ? undefined : { tab: activeRoute.tab, entityId: activeRoute.entityId, report: activeRoute.report };
    setSearchNavigationError(null);
    let targetHash: string;
    try {
      targetHash = buildFinanceHash({ tab: result.tab, entityId: result.entityId, ...(origin ? { back: origin } : {}) });
    } catch {
      setSearchNavigationError('This result cannot be opened with the current return context.');
      return;
    }
    setSearchOriginOrgId(origin ? currentOrg.id : null);
    setSelectedEntityId(result.entityId);
    setActiveTab(result.tab);
    if (typeof window !== 'undefined' && window.location.hash !== targetHash) window.history.pushState(null, '', targetHash);
  };

  const renderActiveView = () => {
    const requiredCapability = getRequiredFinanceCapability(activeTab);
    if (requiredCapability && !financeCapabilities.isEnabled(requiredCapability)) {
      return (
        <CapabilityUnavailable
          loading={financeCapabilities.loading}
          capability={financeCapabilities.getCapability(requiredCapability)}
        />
      );
    }

    switch (activeTab) {
      case 'items':
        if (itemPermissions.loading) return <div role="status" className="p-8 text-sm text-slate-500">Checking item catalog access…</div>;
        if (!canViewItems) return <div role="alert" className="m-8 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{itemPermissions.error || 'You do not have permission to view Items & Services in this organization.'}</div>;
        return <MasterItemsView permissions={itemPermissions.actions} />;
      case 'projects_overview':
      case 'projects':
        return <ProjectsView />;
      case 'banking_overview':
      case 'banking':
        return (
          <BankingView
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={closeSelectedEntity}
          />
        );
      case 'bank_reconciliation':
      case 'reconciliation':
        return (
          <BankingView
            autoOpenReconcile={true}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={closeSelectedEntity}
          />
        );

      // Sales Sub-Tabs
      case 'sales_overview':
        return <SalesOverview onNavigate={handleNavigate} />;
      case 'clients':
        return (
          <ClientsView
            autoOpenCreateModal={autoOpenClientModal}
            onModalClosed={() => setAutoOpenClientModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={closeSelectedEntity}
          />
        );
      case 'estimates':
        return (
          <EstimatesView
            autoOpenCreateModal={autoOpenEstimateModal}
            onModalClosed={() => setAutoOpenEstimateModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={closeSelectedEntity}
          />
        );
      case 'sales_orders':
        return (
          <SalesOrdersView
            autoOpenCreateModal={autoOpenSalesOrderModal}
            onModalClosed={() => setAutoOpenSalesOrderModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={closeSelectedEntity}
          />
        );
      case 'invoices':
        return (
          <InvoicesView
            autoOpenCreateModal={autoOpenInvoiceModal}
            onModalClosed={() => setAutoOpenInvoiceModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={closeSelectedEntity}
          />
        );
      case 'recurring_invoices':
        return <RecurringTransactionsView kind="INVOICE" />;
      case 'delivery_challans':
        return <DeliveryChallansView />;
      case 'payments_received':
        return (
          <PaymentsReceivedView
            autoOpenCreateModal={autoOpenPaymentReceivedModal}
            onModalClosed={() => setAutoOpenPaymentReceivedModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={closeSelectedEntity}
          />
        );
      case 'credit_notes':
        return <SettlementWorkspace side="receivable" initialResource="credits" autoOpenCreateModal={autoOpenCreditNoteModal} onModalClosed={() => setAutoOpenCreditNoteModal(false)} />;
      case 'salespersons':
        return <SalespersonsView />;

      // Purchases Sub-Tabs
      case 'purchases_overview':
        return <PurchasesOverview onNavigate={handleNavigate} />;
      case 'vendors':
        return (
          <VendorsView
            autoOpenCreateModal={autoOpenVendorModal}
            onModalClosed={() => setAutoOpenVendorModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={closeSelectedEntity}
            onNavigateToPurchaseOrder={(purchaseOrderId) => handleNavigate('purchase_orders', { entityId: purchaseOrderId })}
          />
        );
      case 'expenses':
        return (
          <ExpensesView
            autoOpenCreateModal={autoOpenExpenseModal}
            onModalClosed={() => setAutoOpenExpenseModal(false)}
            onExit={() => setActiveTab('dashboard')}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={closeSelectedEntity}
          />
        );
      case 'recurring_expenses':
        return <RecurringTransactionsView kind="EXPENSE" />;
      case 'purchase_orders':
        return (
          <PurchaseOrdersView
            autoOpenCreateModal={autoOpenPurchaseOrderModal}
            onModalClosed={() => setAutoOpenPurchaseOrderModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={closeSelectedEntity}
          />
        );
      case 'bills':
        return (
          <BillsView
            autoOpenCreateModal={autoOpenBillModal}
            onModalClosed={() => setAutoOpenBillModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={closeSelectedEntity}
          />
        );
      case 'recurring_bills':
        return <RecurringTransactionsView kind="BILL" />;
      case 'payments_made':
        return <SettlementWorkspace side="payable" initialResource="payments" autoOpenCreateModal={autoOpenPaymentMadeModal} onModalClosed={() => setAutoOpenPaymentMadeModal(false)} selectedEntityId={selectedEntityId} onSelectedEntityClosed={closeSelectedEntity} />;
      case 'vendor_credits':
        return <SettlementWorkspace side="payable" initialResource="credits" autoOpenCreateModal={autoOpenVendorCreditModal} onModalClosed={() => setAutoOpenVendorCreditModal(false)} selectedEntityId={selectedEntityId} onSelectedEntityClosed={closeSelectedEntity} />;

      // Accounting Sub-Tabs
      case 'accounting_overview':
      case 'accounting':
      case 'journals':
        return (
          <AccountingView
            initialSubTab="journals"
            autoOpenJournalModal={autoOpenJournalModal}
            onJournalModalClosed={() => setAutoOpenJournalModal(false)}
            onSubTabChange={(st) => setActiveTab(st)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={closeSelectedEntity}
          />
        );
      case 'bulk_updates':
        return <AccountingView initialSubTab="bulk_updates" onSubTabChange={(st) => setActiveTab(st)} />;
      case 'coa':
        return (
          <AccountingView
            initialSubTab="coa"
            onSubTabChange={(st) => setActiveTab(st)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={closeSelectedEntity}
          />
        );
      case 'transaction_locking':
        return <AccountingView initialSubTab="transaction_locking" onSubTabChange={(st) => setActiveTab(st)} />;
      case 'fixed_assets':
        return <FixedAssetsView />;
      case 'period_close':
        return <PeriodCloseView />;
      case 'gst_compliance':
        return <GSTComplianceView />;

      // Reports
      case 'reports':
        return <ReportsView initialRoute={parseHashRoute()} />;

      // Settings
      case 'settings_overview':
      case 'settings':
        return <SettingsView />;
      case 'team_access':
        return <TeamAccessView />;
      case 'recovery_center':
        return <RecoveryCenterView />;
      case 'security_center':
      case 'identity_center':
        return <SecurityCenterView />;

      // Stage 6 — Usability, Document Handling & Customer Portal
      case 'document_inbox':
        return <DocumentInboxView />;
      case 'customer_portal':
        return <CustomerPortalView />;
      case 'data_migration':
        return <DataMigrationModal isOpen={true} onClose={() => setActiveTab('accounting')} />;

      default:
        return <DashboardView onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex font-sans">
      {/* Left Strip Sidebar - Fixed Full Height */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => handleNavigate(tab)}
        capabilities={financeCapabilities.capabilities}
        itemsVisible={canViewItems}
        onOpenQuickCreate={() => handleNavigate('invoices', { autoCreate: true })}
        onOpenOrgSwitcher={() => setIsOrgSwitcherOpen(true)}
        onOpenOrgWizard={() => setIsOrgWizardOpen(true)}
      />

      {/* Mobile Navigation Overlay */}
      <MobileNav
        activeTab={activeTab}
        setActiveTab={(tab) => handleNavigate(tab)}
        capabilities={financeCapabilities.capabilities}
        itemsVisible={canViewItems}
        onOpenQuickCreate={() => handleNavigate('invoices', { autoCreate: true })}
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <Header
          currentTab={activeTab as any}
          onNavigate={handleNavigate}
          onSearchResult={handleSearchResult}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenOrgSwitcher={() => setIsOrgSwitcherOpen(true)}
          onOpenOrgWizard={() => setIsOrgWizardOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-0 pb-24 lg:pb-6 focus:outline-none">
          {searchNavigationError && <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{searchNavigationError}</div>}
          {activeRoute.back && (!searchOriginOrgId || searchOriginOrgId === currentOrg.id) && <div className="sticky top-0 z-30 border-b border-blue-200 bg-blue-50 px-4 py-2 dark:border-blue-900 dark:bg-blue-950/50"><button type="button" onClick={returnToOrigin} className="cursor-pointer text-xs font-bold text-blue-700 hover:underline dark:text-blue-300">← Back to {activeRoute.back.tab === 'reports' ? 'originating report' : activeRoute.back.tab.replaceAll('_', ' ')}</button></div>}
          <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading workspace…</div>}>
            {renderActiveView()}
          </Suspense>
        </main>
      </div>

      <MobileBottomNav
        activeTab={activeTab}
        onNavigate={(tab) => handleNavigate(tab)}
        onOpenMore={() => setMobileNavOpen(true)}
      />

      {/* Organization Switcher Modal */}
      <OrganizationSwitcherModal
        isOpen={isOrgSwitcherOpen}
        onClose={() => setIsOrgSwitcherOpen(false)}
        onOpenWizard={() => setIsOrgWizardOpen(true)}
      />

      {/* Create Organization Wizard Modal */}
      <CreateOrganizationWizardModal
        isOpen={isOrgWizardOpen}
        onClose={() => setIsOrgWizardOpen(false)}
      />

      {/* Dev Mode Zero-Auth Test Control Banner */}
      <DevModeBanner />
    </div>
  );
}

export default function App() {
  return (
    <BooksProvider>
      <MainAppLayout />
    </BooksProvider>
  );
}
