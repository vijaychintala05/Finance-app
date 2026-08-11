import { apiClient } from '../api/client';

export interface CustomerInput {
  id?: string;
  name: string;
  companyName?: string;
  displayName?: string;
  legalName?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  taxId?: string;
  billingAddress?: any;
  currency?: string;
  paymentTerms?: string;
}

export interface ProjectInput {
  id?: string;
  code: string;
  name: string;
  clientId?: string;
  customerId?: string;
  clientName?: string;
  description?: string;
  totalBudget?: number;
  budgetType?: string;
  hourlyRate?: number;
  manager?: string;
}

export const customerApi = {
  async listCustomers(search?: string) {
    const url = search && search.trim()
      ? `/finance/customers?search=${encodeURIComponent(search.trim())}`
      : '/finance/customers';
    const res = await apiClient.get<any[]>(url);
    if (res.error) throw new Error(res.error);
    return res.data || [];
  },

  async createCustomer(data: CustomerInput) {
    const payload = {
      name: data.displayName || data.name,
      displayName: data.displayName || data.name,
      legalName: data.legalName || data.companyName || data.name,
      companyName: data.companyName || data.name,
      email: data.email || '',
      phone: data.phone || '',
      gstin: data.gstin || data.taxId || '',
      taxId: data.gstin || data.taxId || '',
      billingAddress: data.billingAddress || '',
      currency: data.currency || 'INR',
      paymentTerms: data.paymentTerms || 'Net 30',
    };
    const res = await apiClient.post<any>('/finance/customers', payload);
    if (res.error) throw new Error(res.error);
    return res.data;
  },

  async listProjects() {
    const res = await apiClient.get<any[]>('/finance/projects');
    if (res.error) throw new Error(res.error);
    return res.data || [];
  },

  async createProject(data: ProjectInput) {
    const res = await apiClient.post<any>('/finance/projects', data);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
};
