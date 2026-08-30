import { apiClient } from '../api/client';
import { CertifiedReportId } from './authoritativeReportService';

export interface SavedReportView {
  id: string;
  name: string;
  report_type: CertifiedReportId;
  visibility: 'PRIVATE' | 'ORGANIZATION';
  is_favorite: boolean;
  config: {
    fromDate?: string;
    toDate?: string;
  };
}

export async function fetchSavedReportViews(): Promise<SavedReportView[]> {
  const response = await apiClient.get<SavedReportView[]>('/finance/saved-reports');
  if (response.error || !response.data) throw new Error(response.error || 'Unable to load saved report views');
  return response.data;
}

export async function saveReportView(input: {
  name: string;
  reportId: CertifiedReportId;
  fromDate: string;
  toDate: string;
  visibility: 'PRIVATE' | 'ORGANIZATION';
}): Promise<void> {
  const response = await apiClient.post('/finance/saved-reports', {
    name: input.name,
    reportType: input.reportId,
    visibility: input.visibility,
    config: { fromDate: input.fromDate, toDate: input.toDate },
  });
  if (response.error) throw new Error(response.error);
}
