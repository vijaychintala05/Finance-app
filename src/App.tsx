import React, { useState } from 'react';
import { BooksProvider } from './context/BooksContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { CreateOrganizationWizardModal } from './components/organization/CreateOrganizationWizardModal';
import { OrganizationSwitcherModal } from './components/organization/OrganizationSwitcherModal';

import { DashboardView } from './components/dashboard/DashboardView';
import { BankingView } from './components/banking/BankingView';
import { ProjectsView } from './components/projects/ProjectsView';
import { ClientsView } from './components/clients/ClientsView';
import { InvoicesView } from './components/invoices/InvoicesView';
import { EstimatesView } from './components/invoices/EstimatesView';
import { ExpensesView } from './components/expenses/ExpensesView';
import { AccountingView, AccountingSubTab } from './components/accounting/AccountingView';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { SalespersonsView } from './components/salespersons/SalespersonsView';

// Purchases Views
import { PurchasesOverview } from './components/purchases/PurchasesOverview';
import { VendorsView } from './components/purchases/VendorsView';
import { RecurringExpensesView } from './components/purchases/RecurringExpensesView';
import { PurchaseOrdersView } from './components/purchases/PurchaseOrdersView';
import { BillsView } from './components/purchases/BillsView';
import { RecurringBillsView } from './components/purchases/RecurringBillsView';
import { PaymentsMadeView } from './components/purchases/PaymentsMadeView';
import { VendorCreditsView } from './components/purchases/VendorCreditsView';
import { SalesOverview } from './components/sales/SalesOverview';
import { SalesOrdersView } from './components/sales/SalesOrdersView';
import { RecurringInvoicesView } from './components/sales/RecurringInvoicesView';
import { DeliveryChallansView } from './components/sales/DeliveryChallansView';
import { PaymentsReceivedView } from './components/sales/PaymentsReceivedView';
import { CreditNotesView } from './components/sales/CreditNotesView';

function MainAppLayout() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isOrgWizardOpen, setIsOrgWizardOpen] = useState(false);
  const [isOrgSwitcherOpen, setIsOrgSwitcherOpen] = useState(false);
  const [autoOpenExpenseModal, setAutoOpenExpenseModal] = useState(false);
  const [autoOpenInvoiceModal, setAutoOpenInvoiceModal] = useState(false);

  const handleNavigate = (tab: string, options?: { autoCreate?: boolean }) => {
    if (tab === 'expenses' && options?.autoCreate) {
      setAutoOpenExpenseModal(true);
    }
    if (tab === 'invoices' && options?.autoCreate) {
      setAutoOpenInvoiceModal(true);
    }
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
        return <BankingView />;
      case 'bank_reconciliation':
      case 'reconciliation':
        return <BankingView autoOpenReconcile={true} />;

      // Sales Sub-Tabs
      case 'sales_overview':
        return <SalesOverview onNavigate={handleNavigate} />;
      case 'clients':
        return <ClientsView />;
      case 'estimates':
        return <EstimatesView />;
      case 'sales_orders':
        return <SalesOrdersView />;
      case 'invoices':
        return (
          <InvoicesView
            autoOpenCreateModal={autoOpenInvoiceModal}
            onModalClosed={() => setAutoOpenInvoiceModal(false)}
          />
        );
      case 'recurring_invoices':
        return <RecurringInvoicesView />;
      case 'delivery_challans':
        return <DeliveryChallansView />;
      case 'payments_received':
        return <PaymentsReceivedView />;
      case 'credit_notes':
        return <CreditNotesView />;
      case 'salespersons':
        return <SalespersonsView />;

      // Purchases Sub-Tabs
      case 'purchases_overview':
        return <PurchasesOverview onNavigate={handleNavigate} />;
      case 'vendors':
        return <VendorsView />;
      case 'expenses':
        return (
          <ExpensesView
            autoOpenCreateModal={autoOpenExpenseModal}
            onModalClosed={() => {
              setAutoOpenExpenseModal(false);
            }}
            onExit={() => setActiveTab('dashboard')}
          />
        );
      case 'recurring_expenses':
        return <RecurringExpensesView />;
      case 'purchase_orders':
        return <PurchaseOrdersView />;
      case 'bills':
        return <BillsView />;
      case 'recurring_bills':
        return <RecurringBillsView />;
      case 'payments_made':
        return <PaymentsMadeView />;
      case 'vendor_credits':
        return <VendorCreditsView />;

      // Accounting Sub-Tabs
      case 'accounting_overview':
      case 'accounting':
      case 'journals':
        return <AccountingView initialSubTab="journals" onSubTabChange={(st) => setActiveTab(st)} />;
      case 'bulk_updates':
        return <AccountingView initialSubTab="bulk_updates" onSubTabChange={(st) => setActiveTab(st)} />;
      case 'coa':
        return <AccountingView initialSubTab="coa" onSubTabChange={(st) => setActiveTab(st)} />;
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
        onOpenOrgSwitcher={() => setIsOrgSwitcherOpen(true)}
        onOpenOrgWizard={() => setIsOrgWizardOpen(true)}
      />

      {/* Mobile Navigation Overlay */}
      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
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
          {renderActiveView()}
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
