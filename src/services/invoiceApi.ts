import { ApiRequestError, apiClient } from '../api/client';

export const invoiceApi = {
  /**
   * Downloads certified Tax Invoice PDF blob from backend
   */
  async getInvoicePdf(id: string): Promise<Blob> {
    // The PDF catalogue owns the active invoice template and loads the
    // authoritative invoice, organization profile, and ledger details server-side.
    const endpoint = `/finance/documents/invoices/${id}/pdf/issue`;
    const res = await apiClient.postBlob(endpoint, {});
    if (res.status === 403) {
      const retained = await apiClient.getBlob(`/finance/invoices/${id}/pdf`);
      if (retained.data && !retained.error) return retained.data;
      const preview = await apiClient.getBlob(`/finance/documents/invoices/${id}/pdf?preview=true`);
      if (!preview.data || preview.error) throw new ApiRequestError(preview, 'Only users with invoice-send permission can issue a PDF; no retained invoice PDF is available.');
      return preview.data;
    }
    if (res.error && /only finalized documents/i.test(res.error)) {
      const preview = await apiClient.getBlob(`/finance/documents/invoices/${id}/pdf?preview=true`);
      if (!preview.data || preview.error) throw new ApiRequestError(preview, 'Failed to download invoice preview');
      return preview.data;
    }
    if (res.error || !res.data) throw new ApiRequestError(res, 'Failed to download invoice PDF');
    return res.data;
  },

  /**
   * Dispatches invoice email to client
   */
  async sendInvoiceEmail(
    id: string,
    payload: { recipientEmail: string; subject?: string; message?: string }
  ): Promise<{ state: 'QUEUED'; outboxId: string; invoiceNumber: string; recipientEmail: string; message: string; requestId?: string }> {
    const res = await apiClient.post<any>(`/finance/invoices/${id}/send-email`, payload);
    if (res.error || !res.data) {
      throw new ApiRequestError(res, 'Failed to send invoice email');
    }
    return { ...res.data, requestId: res.requestId };
  },

  /**
   * Schedules / sends payment reminder email for invoice
   */
  async sendInvoiceReminder(
    id: string,
    payload?: { recipientEmail?: string }
  ): Promise<{ state: 'QUEUED'; outboxId: string; invoiceNumber: string; recipientEmail: string; message: string; requestId?: string }> {
    const res = await apiClient.post<any>(`/finance/invoices/${id}/reminder`, payload || {});
    if (res.error || !res.data) {
      throw new ApiRequestError(res, 'Failed to send payment reminder');
    }
    return { ...res.data, requestId: res.requestId };
  },

  async getInvoiceEmailDeliveries(id: string): Promise<{ deliveries: Array<{ id: string; kind: 'SEND' | 'REMINDER'; recipientEmail: string; status: string; retryCount: number; acceptedAt?: string | null; createdAt: string }> }> {
    const res = await apiClient.get<any>(`/finance/invoices/${id}/email-deliveries`);
    if (res.error || !res.data) throw new ApiRequestError(res, 'Failed to fetch invoice email delivery history');
    return res.data;
  },

  /**
   * Fetches accounting GL journal drilldown for this invoice
   */
  async getInvoiceJournal(id: string, journalEntryId?: string): Promise<any> {
    const journalQuery = journalEntryId ? `?journalEntryId=${encodeURIComponent(journalEntryId)}` : '';
    const res = await apiClient.get<any>(`/finance/invoices/${id}/journal${journalQuery}`);
    if (res.error || !res.data) {
      throw new ApiRequestError(res, 'Failed to fetch invoice accounting journal');
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
      throw new ApiRequestError(res, 'Failed to record write-off');
    }
    return { ...res.data, requestId: res.requestId };
  },
};
