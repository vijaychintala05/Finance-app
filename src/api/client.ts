/**
 * API Client Abstraction for Backend REST API Communication
 */

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
  errorCode?: string;
  recovery?: string;
  requestId?: string;
  retryable?: boolean;
  cause?: string;
  fix?: string;
  docUrl?: string;
  currentState?: unknown;
  idempotencyKey?: string;
}

export type TimeEntryCreateOperationStatus =
  | { state: 'UNKNOWN' | 'PROCESSING' }
  | { state: 'COMPLETED'; responseStatus: number; entryId: string }

export type InvoiceCreateOperationStatus =
  | { state: 'UNKNOWN' | 'PROCESSING' }
  | { state: 'REJECTED'; responseStatus: number; code: string; error: string }
  | { state: 'CONFLICT'; error: string }
  | { state: 'COMPLETED'; invoiceId: string; commandId: string; invoiceNumber: string; invoiceStatus: string; journalEntryId?: string };

export type InvoiceVoidOperationStatus =
  | { state: 'UNKNOWN' | 'PROCESSING' }
  | { state: 'REJECTED'; responseStatus: number; code: string; error: string }
  | { state: 'COMPLETED'; invoiceId: string; reversalJournalId: string; requestId?: string }
  | { state: 'CONFLICT'; invoiceId: string; reversalJournalId?: string; requestId?: string; error: string };
function encodeHeaderBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
export class ApiRequestError extends Error {
  readonly response: ApiResponse<unknown>;

  constructor(response: ApiResponse<unknown>, fallbackMessage: string) {
    super(response.error || fallbackMessage);
    this.name = 'ApiRequestError';
    this.response = response;
  }
}

export class ApiClient {
  private baseUrl: string;
  private pendingMutationKeys = new Map<string, string>();

  constructor(baseUrl: string = '/api/v1') {
    this.baseUrl = baseUrl;
  }

  createIdempotencyKey(): string {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      return `web-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    }
    throw new Error('Secure randomness is unavailable; mutation was not sent');
  }

  private createRequestId(): string {
    if (globalThis.crypto?.randomUUID) return `web-${globalThis.crypto.randomUUID()}`;
    if (globalThis.crypto?.getRandomValues) {
      const bytes = new Uint8Array(12);
      globalThis.crypto.getRandomValues(bytes);
      return `web-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    }
    return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private responseMetadata(response: Partial<Response>, body: Record<string, any>, fallbackRequestId: string) {
    return {
      requestId: String(body.requestId || response.headers?.get?.('x-request-id') || fallbackRequestId),
      errorCode: body.code,
      recovery: body.recovery,
      retryable: typeof body.retryable === 'boolean' ? body.retryable : undefined,
      cause: body.cause,
      fix: body.fix,
      docUrl: body.docUrl,
      currentState: body.currentState,
    };
  }

  private async pendingMutationStorageKey(fingerprint: string): Promise<string | undefined> {
    if (typeof window === 'undefined' || !globalThis.crypto?.subtle) return undefined;
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `firmbooks_pending_mutation_${hash}`;
  }

  private readPersistedMutationKey(storageKey: string | undefined): string | undefined {
    if (!storageKey) return undefined;
    try {
      return window.sessionStorage.getItem(storageKey) || undefined;
    } catch {
      return undefined;
    }
  }

  private persistMutationKey(storageKey: string | undefined, key: string): void {
    if (!storageKey) return;
    try {
      window.sessionStorage.setItem(storageKey, key);
    } catch {
      // The in-memory key still protects retries in this page lifecycle.
    }
  }

  private clearMutationKey(fingerprint: string, storageKey: string | undefined): void {
    this.pendingMutationKeys.delete(fingerprint);
    if (!storageKey) return;
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Storage may be unavailable in a restricted browser context.
    }
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const activeOrgId = localStorage.getItem('active_organization_id');
      if (activeOrgId) headers['X-Organization-ID'] = activeOrgId;
    }

    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const providedHeaders = new Headers(options.headers);
    const requestId = providedHeaders.get('x-request-id') || this.createRequestId();
    let usedIdempotencyKey: string | undefined;
    try {
      const authHeaders = this.getAuthHeaders();
      const method = (options.method || 'GET').toUpperCase();
      const mutationHeaders: Record<string, string> = {};
      let mutationFingerprint: string | undefined;
      let mutationStorageKey: string | undefined;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const organizationId = providedHeaders.get('x-organization-id') || (typeof window !== 'undefined'
          ? localStorage.getItem('active_organization_id') || 'no-organization'
          : 'server');
        mutationFingerprint = `${organizationId}:${method}:${endpoint}:${String(options.body || '')}`;
        mutationStorageKey = await this.pendingMutationStorageKey(mutationFingerprint);
        const existingKey = this.pendingMutationKeys.get(mutationFingerprint)
          || this.readPersistedMutationKey(mutationStorageKey);
        const idempotencyKey = providedHeaders.get('idempotency-key') || existingKey || this.createIdempotencyKey();
        usedIdempotencyKey = idempotencyKey;
        this.pendingMutationKeys.set(mutationFingerprint, idempotencyKey);
        this.persistMutationKey(mutationStorageKey, idempotencyKey);
        mutationHeaders['Idempotency-Key'] = idempotencyKey;
      }
      const requestHeaders = new Headers(authHeaders);
      Object.entries(mutationHeaders).forEach(([name, value]) => requestHeaders.set(name, value));
      providedHeaders.forEach((value, name) => requestHeaders.set(name, value));
      requestHeaders.set('X-Request-ID', requestId);

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        credentials: 'same-origin',
        headers: requestHeaders,
      });

      if (!response.ok) {
        const parsedError = await response.json().catch(() => ({ message: response.statusText, error: response.statusText }));
        const errorData = parsedError && typeof parsedError === 'object' ? parsedError : { error: response.statusText };
        // Keep the key only when the server may still be processing the same
        // request. Definitive business conflicts must not poison a later retry.
        const inProgress409 = response.status === 409 && (
          errorData.code === 'COMMAND_IN_PROGRESS'
          || String(errorData.error || errorData.message || '').toLowerCase().includes('identical request is already being processed')
        );
        if (mutationFingerprint && response.status < 500 && !inProgress409) {
          this.clearMutationKey(mutationFingerprint, mutationStorageKey);
        }
        return {
          data: null,
          error: errorData.details || errorData.error || errorData.message || `HTTP Error ${response.status}`,
          status: response.status,
          idempotencyKey: usedIdempotencyKey,
          ...this.responseMetadata(response, errorData, requestId),
        };
      }

      const responseText = await response.text();
      const data = responseText.trim() ? JSON.parse(responseText) : null;
      if (mutationFingerprint) this.clearMutationKey(mutationFingerprint, mutationStorageKey);
      return {
        data,
        error: null,
        status: response.status,
        requestId: response.headers?.get?.('x-request-id') || requestId,
        idempotencyKey: usedIdempotencyKey,
      };
    } catch (err: any) {
      return {
        data: null,
        error: err.message || 'Network communication failure',
        status: 500,
        errorCode: 'NETWORK_FAILURE',
        recovery: 'Check your connection, then reload before retrying this financial action.',
        requestId,
        retryable: true,
        idempotencyKey: usedIdempotencyKey,
      };
    }
  }

  async hasPendingPostIdempotencyKey(endpoint: string, body: unknown, organizationId: string): Promise<boolean> {
    const fingerprint = `${organizationId}:POST:${endpoint}:${JSON.stringify(body)}`;
    const storageKey = await this.pendingMutationStorageKey(fingerprint);
    return Boolean(this.pendingMutationKeys.get(fingerprint) || this.readPersistedMutationKey(storageKey));
  }
  async get<T>(endpoint: string, organizationId?: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'GET',
      ...(organizationId ? { headers: { 'X-Organization-ID': organizationId } } : {}),
    });
  }

  async getBlob(endpoint: string, organizationId?: string): Promise<ApiResponse<Blob>> {
    const requestId = this.createRequestId();
    try {
      const headers = new Headers(this.getAuthHeaders());
      if (organizationId) headers.set('X-Organization-ID', organizationId);
      headers.set('X-Request-ID', requestId);
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        credentials: 'same-origin',
        headers,
      });
      if (!response.ok) {
        const parsedError = await response.json().catch(() => ({ error: response.statusText }));
        const errorData = parsedError && typeof parsedError === 'object' ? parsedError : { error: response.statusText };
        return { data: null, error: errorData.error || response.statusText, status: response.status, ...this.responseMetadata(response, errorData, requestId) };
      }
      return { data: await response.blob(), error: null, status: response.status, requestId: response.headers?.get?.('x-request-id') || requestId };
    } catch (error: any) {
      return { data: null, error: error.message || 'Receipt image could not be loaded', status: 500, errorCode: 'NETWORK_FAILURE', recovery: 'Check your connection and retry loading the receipt.', requestId, retryable: true };
    }
  }

  async post<T>(endpoint: string, body?: any, organizationId?: string, idempotencyKey?: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      ...(organizationId || idempotencyKey ? { headers: {
        ...(organizationId ? { 'X-Organization-ID': organizationId } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      } } : {}),
    });
  }

  async postBlob(endpoint: string, body: unknown, organizationId?: string): Promise<ApiResponse<Blob>> {
    const requestId = this.createRequestId();
    const serializedBody = JSON.stringify(body ?? {});
    const resolvedOrg = organizationId || (typeof window !== 'undefined' ? localStorage.getItem('active_organization_id') || 'no-organization' : 'server');
    const fingerprint = `${resolvedOrg}:POST:${endpoint}:${serializedBody}`;
    const storageKey = await this.pendingMutationStorageKey(fingerprint);
    const idempotencyKey = this.pendingMutationKeys.get(fingerprint)
      || this.readPersistedMutationKey(storageKey)
      || this.createIdempotencyKey();
    this.pendingMutationKeys.set(fingerprint, idempotencyKey);
    this.persistMutationKey(storageKey, idempotencyKey);
    try {
      const headers = new Headers(this.getAuthHeaders());
      if (organizationId) headers.set('X-Organization-ID', organizationId);
      headers.set('X-Request-ID', requestId);
      headers.set('Idempotency-Key', idempotencyKey);
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST', credentials: 'same-origin', headers, body: serializedBody,
      });
      if (!response.ok) {
        const parsedError = await response.json().catch(() => ({ error: response.statusText }));
        const errorData = parsedError && typeof parsedError === 'object' ? parsedError : { error: response.statusText };
        if (response.status < 500) this.clearMutationKey(fingerprint, storageKey);
        return { data: null, error: errorData.error || response.statusText, status: response.status,
          idempotencyKey, ...this.responseMetadata(response, errorData, requestId) };
      }
      const blob = await response.blob();
      this.clearMutationKey(fingerprint, storageKey);
      return { data: blob, error: null, status: response.status,
        requestId: response.headers?.get('x-request-id') || requestId, idempotencyKey };
    } catch (error: any) {
      return { data: null, error: error.message || 'Network communication failure', status: 500,
        errorCode: 'NETWORK_FAILURE', recovery: 'Retry the same PDF request to retrieve the original issued bytes.',
        requestId, retryable: true, idempotencyKey };
    }
  }

  async getTimeEntryCreateOperationStatus(idempotencyKey: string, organizationId: string): Promise<ApiResponse<TimeEntryCreateOperationStatus>> {
    return this.request<TimeEntryCreateOperationStatus>('/finance/time-entries/create-operation-status', {
      method: 'GET',
      headers: { 'X-Organization-ID': organizationId, 'Idempotency-Key': idempotencyKey },
    });
  }
  async createOperationRequestHash(method: string, endpoint: string, body: unknown): Promise<string> {
    if (!globalThis.crypto?.subtle) throw new Error('Secure operation verification is unavailable; invoice was not sent');
    const basePath = new URL(this.baseUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').pathname.replace(/\/$/, '');
    const path = `${basePath}${endpoint}`;
    const bytes = new TextEncoder().encode(JSON.stringify({ method: method.toUpperCase(), path, body }));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
  }

  async getInvoiceCreateOperationStatus(idempotencyKey: string, requestHash: string, organizationId: string): Promise<ApiResponse<InvoiceCreateOperationStatus>> {
    return this.request<InvoiceCreateOperationStatus>('/finance/invoices/create-operation-status', {
      method: 'GET',
      headers: { 'X-Organization-ID': organizationId, 'Idempotency-Key': idempotencyKey, 'X-Operation-Request-Hash': requestHash },
    });
  }
  async getInvoiceVoidOperationStatus(invoiceId: string, idempotencyKey: string, organizationId: string, reason: string): Promise<ApiResponse<InvoiceVoidOperationStatus>> {
    return this.request<InvoiceVoidOperationStatus>(`/security/void-invoice/${encodeURIComponent(invoiceId)}/operation-status`, {
      method: 'GET',
      headers: { 'X-Organization-ID': organizationId, 'Idempotency-Key': idempotencyKey, 'X-Operation-Reason-Base64': encodeHeaderBase64Url(reason) },
    });
  }

  async put<T>(endpoint: string, body?: any, organizationId?: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      ...(organizationId ? { headers: { 'X-Organization-ID': organizationId } } : {}),
    });
  }

  async patch<T>(endpoint: string, body?: any, organizationId?: string, idempotencyKey?: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      ...(organizationId || idempotencyKey ? { headers: {
        ...(organizationId ? { 'X-Organization-ID': organizationId } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      } } : {}),
    });
  }

  async delete<T>(endpoint: string, organizationId?: string, idempotencyKey?: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      ...(organizationId || idempotencyKey ? { headers: {
        ...(organizationId ? { 'X-Organization-ID': organizationId } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      } } : {}),
    });
  }
}

export const apiClient = new ApiClient();
