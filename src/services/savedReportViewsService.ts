import { apiClient } from '../api/client';
export interface SavedReportView {
  id: string;
  name: string;
  report_type: string;
  visibility: 'PRIVATE' | 'ORGANIZATION';
  is_favorite: boolean;
  config: {
    fromDate?: string;
    toDate?: string;
    projectId?: string;
    visibleColumns?: string[];
    customerId?: string;
    vendorId?: string;
    accountId?: string;
    status?: string;
  };
}

export async function fetchSavedReportViews(organizationId: string): Promise<SavedReportView[]> {
  const response = await apiClient.get<SavedReportView[]>('/finance/saved-reports', organizationId);
  if (response.error || !response.data) throw new Error(response.error || 'Unable to load saved report views');
  return response.data;
}

export async function saveReportView(input: {
  organizationId: string;
  name: string;
  reportId: string;
  fromDate: string;
  toDate: string;
  projectId?: string;
  visibleColumns?: string[];
  customerId?: string;
  vendorId?: string;
  accountId?: string;
  status?: string;
  visibility: 'PRIVATE' | 'ORGANIZATION';
}): Promise<void> {
  const response = await apiClient.post('/finance/saved-reports', {
    name: input.name,
    reportType: input.reportId,
    visibility: input.visibility,
    config: { fromDate: input.fromDate, toDate: input.toDate, projectId: input.projectId, visibleColumns: input.visibleColumns, customerId: input.customerId, vendorId: input.vendorId, accountId: input.accountId, status: input.status },
  }, input.organizationId);
  if (response.error) throw new Error(response.error);
}
