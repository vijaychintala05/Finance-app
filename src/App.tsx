import React, { Suspense, useState } from 'react';
import { BooksProvider } from './context/BooksContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { CreateOrganizationWizardModal } from './components/organization/CreateOrganizationWizardModal';
import { OrganizationSwitcherModal } from './components/organization/OrganizationSwitcherModal';

const lazyNamed = <T extends React.ComponentType<any>>(loader: () => Promise<any>, name: string) =>
  React.lazy(async () => ({ default: (await loader())[name] as T }));

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
const RecurringExpensesView = lazyNamed(() => import('./components/purchases/RecurringExpensesView'), 'RecurringExpensesView');
const PurchaseOrdersView = lazyNamed(() => import('./components/purchases/PurchaseOrdersView'), 'PurchaseOrdersView');
const BillsView = lazyNamed(() => import('./components/purchases/BillsView'), 'BillsView');
const RecurringBillsView = lazyNamed(() => import('./components/purchases/RecurringBillsView'), 'RecurringBillsView');
const PaymentsMadeView = lazyNamed(() => import('./components/purchases/PaymentsMadeView'), 'PaymentsMadeView');
const VendorCreditsView = lazyNamed(() => import('./components/purchases/VendorCreditsView'), 'VendorCreditsView');
const SalesOverview = lazyNamed(() => import('./components/sales/SalesOverview'), 'SalesOverview');
const SalesOrdersView = lazyNamed(() => import('./components/sales/SalesOrdersView'), 'SalesOrdersView');
const RecurringInvoicesView = lazyNamed(() => import('./components/sales/RecurringInvoicesView'), 'RecurringInvoicesView');
const DeliveryChallansView = lazyNamed(() => import('./components/sales/DeliveryChallansView'), 'DeliveryChallansView');
const PaymentsReceivedView = lazyNamed(() => import('./components/sales/PaymentsReceivedView'), 'PaymentsReceivedView');
const CreditNotesView = lazyNamed(() => import('./components/sales/CreditNotesView'), 'CreditNotesView');

function MainAppLayout() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isOrgWizardOpen, setIsOrgWizardOpen] = useState(false);
  const [isOrgSwitcherOpen, setIsOrgSwitcherOpen] = useState(false);

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

  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(undefined);

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

    setActiveTab(tab);
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView onNavigate={handleNavigate} />;
      case 'projects_overview':
      case 'projects':
        return <ProjectsView />;
      case 'banking_overview':
      case 'banking':
        return (
          <BankingView
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
          />
        );
      case 'bank_reconciliation':
      case 'reconciliation':
        return (
          <BankingView
            autoOpenReconcile={true}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
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
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
          />
        );
      case 'estimates':
        return (
          <EstimatesView
            autoOpenCreateModal={autoOpenEstimateModal}
            onModalClosed={() => setAutoOpenEstimateModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
          />
        );
      case 'sales_orders':
        return (
          <SalesOrdersView
            autoOpenCreateModal={autoOpenSalesOrderModal}
            onModalClosed={() => setAutoOpenSalesOrderModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
          />
        );
      case 'invoices':
        return (
          <InvoicesView
            autoOpenCreateModal={autoOpenInvoiceModal}
            onModalClosed={() => setAutoOpenInvoiceModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
          />
        );
      case 'recurring_invoices':
        return <RecurringInvoicesView />;
      case 'delivery_challans':
        return <DeliveryChallansView />;
      case 'payments_received':
        return (
          <PaymentsReceivedView
            autoOpenCreateModal={autoOpenPaymentReceivedModal}
            onModalClosed={() => setAutoOpenPaymentReceivedModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
          />
        );
      case 'credit_notes':
        return (
          <CreditNotesView
            autoOpenCreateModal={autoOpenCreditNoteModal}
            onModalClosed={() => setAutoOpenCreditNoteModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
          />
        );
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
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
          />
        );
      case 'expenses':
        return (
          <ExpensesView
            autoOpenCreateModal={autoOpenExpenseModal}
            onModalClosed={() => setAutoOpenExpenseModal(false)}
            onExit={() => setActiveTab('dashboard')}
          />
        );
      case 'recurring_expenses':
        return <RecurringExpensesView />;
      case 'purchase_orders':
        return (
          <PurchaseOrdersView
            autoOpenCreateModal={autoOpenPurchaseOrderModal}
            onModalClosed={() => setAutoOpenPurchaseOrderModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
          />
        );
      case 'bills':
        return (
          <BillsView
            autoOpenCreateModal={autoOpenBillModal}
            onModalClosed={() => setAutoOpenBillModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
          />
        );
      case 'recurring_bills':
        return <RecurringBillsView />;
      case 'payments_made':
        return (
          <PaymentsMadeView
            autoOpenCreateModal={autoOpenPaymentMadeModal}
            onModalClosed={() => setAutoOpenPaymentMadeModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
          />
        );
      case 'vendor_credits':
        return (
          <VendorCreditsView
            autoOpenCreateModal={autoOpenVendorCreditModal}
            onModalClosed={() => setAutoOpenVendorCreditModal(false)}
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
          />
        );

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
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
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
            onSelectedEntityClosed={() => setSelectedEntityId(undefined)}
          />
        );
      case 'transaction_locking':
        return <AccountingView initialSubTab="transaction_locking" onSubTabChange={(st) => setActiveTab(st)} />;

      // Reports
      case 'reports':
        return <ReportsView />;

      // Settings
      case 'settings_overview':
      case 'settings':
        return <SettingsView />;

      default:
        return <DashboardView onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex font-sans">
      {/* Left Strip Sidebar - Fixed Full Height */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenQuickCreate={() => handleNavigate('invoices', { autoCreate: true })}
        onOpenOrgSwitcher={() => setIsOrgSwitcherOpen(true)}
        onOpenOrgWizard={() => setIsOrgWizardOpen(true)}
      />

      {/* Mobile Navigation Overlay */}
      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenQuickCreate={() => handleNavigate('invoices', { autoCreate: true })}
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <Header
          currentTab={activeTab as any}
          onNavigate={handleNavigate}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenOrgSwitcher={() => setIsOrgSwitcherOpen(true)}
          onOpenOrgWizard={() => setIsOrgWizardOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-0 pb-16 lg:pb-6 focus:outline-none">
          <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading workspace…</div>}>
            {renderActiveView()}
          </Suspense>
        </main>
      </div>

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
