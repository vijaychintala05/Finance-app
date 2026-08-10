import {
  Account,
  Bill,
  Client,
  CreditNote,
  DeliveryChallan,
  Estimate,
  Expense,
  FirmSettings,
  Invoice,
  JournalEntry,
  OrganizationMeta,
  PaymentMade,
  PaymentReceipt,
  PeriodLock,
  Project,
  PurchaseOrder,
  RecurringBill,
  RecurringExpense,
  RecurringInvoiceProfile,
  SalesOrder,
  Salesperson,
  TimeEntry,
  Vendor,
  VendorCredit,
} from '../types';

export interface BaseRepository<T extends { id: string }> {
  getAll(orgId: string): T[];
  getById(orgId: string, id: string): T | null;
  saveAll(orgId: string, items: T[]): void;
  create(orgId: string, item: Omit<T, 'id'>): T;
  update(orgId: string, id: string, updates: Partial<T>): T | null;
  delete(orgId: string, id: string): boolean;
}

export interface IOrganizationRepository {
  getOrganizations(): OrganizationMeta[];
  saveOrganizations(orgs: OrganizationMeta[]): void;
  getById(id: string): OrganizationMeta | null;
}

export interface ISettingsRepository {
  getSettings(orgId: string): FirmSettings;
  saveSettings(orgId: string, settings: FirmSettings): void;
}
