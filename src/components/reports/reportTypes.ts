export type ReportCategory =
  | 'Business Overview'
  | 'Sales'
  | 'Receivables'
  | 'Payments Received'
  | 'Recurring Invoices'
  | 'Payables'
  | 'Purchases and Expenses'
  | 'Taxes'
  | 'Banking'
  | 'Projects and Timesheet'
  | 'Accountant'
  | 'Currency'
  | 'Activity'
  | 'Automation';

export interface ReportItem {
  id: string;
  name: string;
  category: ReportCategory;
  description: string;
  createdBy: string;
  lastVisited?: string;
  isFavorite?: boolean;
}

export type SidebarGroup =
  | 'home'
  | 'favorites'
  | 'shared'
  | 'scheduled'
  | ReportCategory;
