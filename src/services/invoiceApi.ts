import { apiClient } from '../api/client';

export const invoiceApi = {
  /**
   * Downloads certified Tax Invoice PDF blob from backend
   */
  async getInvoicePdf(id: string): Promise<Blob> {
    const res = await apiClient.getBlob(`/finance/invoices/${id}/pdf`);
    if (res.error || !res.data) {
      throw new Error(res.error || 'Failed to download invoice PDF');
    }
    return res.data;
  },

  /**
   * Dispatches invoice email to client
   */
  async sendInvoiceEmail(
    id: string,
    payload: { recipientEmail: string; subject?: string; message?: string }
  ): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post<any>(`/finance/invoices/${id}/send-email`, payload);
    if (res.error || !res.data) {
      throw new Error(res.error || 'Failed to send invoice email');
    }
    return res.data;
  },

  /**
   * Schedules / sends payment reminder email for invoice
   */
  async sendInvoiceReminder(
    id: string,
    payload?: { recipientEmail?: string }
  ): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post<any>(`/finance/invoices/${id}/reminder`, payload || {});
    if (res.error || !res.data) {
      throw new Error(res.error || 'Failed to send payment reminder');
    }
    return res.data;
  },

  /**
   * Fetches accounting GL journal drilldown for this invoice
   */
  async getInvoiceJournal(id: string): Promise<any> {
    const res = await apiClient.get<any>(`/finance/invoices/${id}/journal`);
    if (res.error || !res.data) {
      throw new Error(res.error || 'Failed to fetch invoice accounting journal');
    }
    return res.data;
  },

  /**
   * Records a certified bad debt write-off for an invoice
   */
  async recordWriteOff(payload: {
    invoiceId: string;
    customerId?: string;
    clientId?: string;
    writeOffDate: string;
    amount: number;
    reason?: string;
    writeOffAccountId?: string;
  }): Promise<any> {
    const res = await apiClient.post<any>('/finance/write-offs', payload);
    if (res.error || !res.data) {
      throw new Error(res.error || 'Failed to record write-off');
    }
    return res.data;
  },
};
