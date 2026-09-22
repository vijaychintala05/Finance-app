import { apiClient } from '../api/client';

export interface TransactionHistoryEvent {
  id: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  reason?: string;
  summary: string;
  details?: Record<string, any>;
  beforeState?: any;
  afterState?: any;
  metadata?: any;
}

type TransactionHistoryResponse = TransactionHistoryEvent[] | { audit: TransactionHistoryEvent[] };

function extractHistory(data: TransactionHistoryResponse | null): TransactionHistoryEvent[] {
  if (Array.isArray(data)) return data;
  return data?.audit || [];
}

export const historyApi = {
  async getEntityHistory(entityType: string, entityId: string): Promise<TransactionHistoryEvent[]> {
    const res = await apiClient.get<TransactionHistoryResponse>(
      `/audit-logs?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`
    );
    if (res.error) {
      const fallback = await apiClient.get<TransactionHistoryResponse>(
        `/audit?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`
      );
      if (fallback.error) throw new Error(fallback.error);
      return extractHistory(fallback.data);
    }
    return extractHistory(res.data);
  },
};
