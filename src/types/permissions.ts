export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PermissionMetadata {
  code: string;
  module: string;
  resource: string;
  action: string;
  risk: RiskTier;
  description: string;
  dependencies: string[];
}

export interface SodConflict {
  id: string;
  title: string;
  permissionA: string;
  permissionB: string;
  risk: 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  mitigation: string;
}

export interface CustomRoleModel {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  isSystemRole: boolean;
  permissions: string[];
  assignedUsersCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export const SOD_CONFLICTS: SodConflict[] = [
  {
    id: 'SOD-001',
    title: 'Vendor Master & Disbursement Pairing',
    permissionA: 'vendors.create',
    permissionB: 'vendor_payments.create',
    risk: 'CRITICAL',
    description: 'The same role can create suppliers and make payments.',
    mitigation: 'Separate vendor master maintenance from payment execution.',
  },
  {
    id: 'SOD-002',
    title: 'Bill Entry & Payment Disbursement Pairing',
    permissionA: 'bills.create',
    permissionB: 'vendor_payments.create',
    risk: 'HIGH',
    description: 'The same role can enter vendor bills and pay them.',
    mitigation: 'Use an approval workflow or separate these roles.',
  },
  {
    id: 'SOD-003',
    title: 'Invoice & Write-Off Pairing',
    permissionA: 'invoices.create',
    permissionB: 'invoices.write_off',
    risk: 'CRITICAL',
    description: 'The same role can create invoices and write off balances.',
    mitigation: 'Restrict write-offs to a finance manager or owner.',
  },
];

export function detectSodConflicts(permissions: string[]): SodConflict[] {
  const assigned = new Set(permissions);
  return SOD_CONFLICTS.filter((conflict) => assigned.has(conflict.permissionA) && assigned.has(conflict.permissionB));
}
