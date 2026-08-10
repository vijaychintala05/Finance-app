import { apiClient } from '../api/client';

export interface QuotationLineItemInput {
  id?: string;
  itemId?: string;
  name?: string;
  itemName?: string;
  description?: string;
  hsnSac?: string;
  quantity: number;
  unit?: string;
  rate: number;
  discountPercent?: number;
  discountAmount?: number;
  taxRate?: number;
}

export interface QuotationInput {
  customerId?: string;
  customerName?: string;
  clientName?: string;
  projectId?: string;
  issueDate?: string;
  expiryDate?: string;
  validityDays?: number;
  items: QuotationLineItemInput[];
  overallDiscount?: number;
  isGstInclusive?: boolean;
  notes?: string;
  terms?: string;
  status?: string;
}

export const quotationApi = {
  async listQuotations(search?: string, status?: string) {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.get<{ quotations: any[] }>(`/quotations${query}`);
    if (res.error) throw new Error(res.error);
    return res.data?.quotations || [];
  },

  async getQuotation(id: string) {
    const res = await apiClient.get<{ quotation: any }>(`/quotations/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data?.quotation;
  },

  async createQuotation(data: QuotationInput) {
    const res = await apiClient.post<{ quotation: any }>('/quotations', data);
    if (res.error) throw new Error(res.error);
    return res.data?.quotation;
  },

  async updateQuotation(id: string, data: Partial<QuotationInput>) {
    const res = await apiClient.put<{ quotation: any }>(`/quotations/${id}`, data);
    if (res.error) throw new Error(res.error);
    return res.data?.quotation;
  },

  async convertQuotationToInvoice(id: string) {
    const res = await apiClient.post<{ invoice: any }>(`/quotations/${id}/convert-inv`);
    if (res.error) throw new Error(res.error);
    return res.data?.invoice;
  },

  async convertQuotationToSalesOrder(id: string) {
    const res = await apiClient.post<{ salesOrder: any }>(`/quotations/${id}/convert-so`);
    if (res.error) throw new Error(res.error);
    return res.data?.salesOrder;
  },

  async listItems(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await apiClient.get<{ items: any[] }>(`/items${query}`);
    if (res.error) throw new Error(res.error);
    return res.data?.items || [];
  },
};
