/**
 * API Client Abstraction for Backend REST API Communication
 */

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

export class ApiClient {
  private baseUrl: string;
  private pendingMutationKeys = new Map<string, string>();

  constructor(baseUrl: string = '/api/v1') {
    this.baseUrl = baseUrl;
  }

  private createIdempotencyKey(): string {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      return `web-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    }
    throw new Error('Secure randomness is unavailable; mutation was not sent');
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
    try {
      const authHeaders = this.getAuthHeaders();
      const method = (options.method || 'GET').toUpperCase();
      const mutationHeaders: Record<string, string> = {};
      let mutationFingerprint: string | undefined;
      let mutationStorageKey: string | undefined;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const organizationId = typeof window !== 'undefined'
          ? localStorage.getItem('active_organization_id') || 'no-organization'
          : 'server';
        mutationFingerprint = `${organizationId}:${method}:${endpoint}:${String(options.body || '')}`;
        mutationStorageKey = await this.pendingMutationStorageKey(mutationFingerprint);
        const existingKey = this.pendingMutationKeys.get(mutationFingerprint)
          || this.readPersistedMutationKey(mutationStorageKey);
        const idempotencyKey = existingKey || this.createIdempotencyKey();
        this.pendingMutationKeys.set(mutationFingerprint, idempotencyKey);
        this.persistMutationKey(mutationStorageKey, idempotencyKey);
        mutationHeaders['Idempotency-Key'] = idempotencyKey;
      }
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        credentials: 'same-origin',
        headers: {
          ...authHeaders,
          ...mutationHeaders,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText, error: response.statusText }));
        // Preserve the key for an uncertain server outcome or an in-flight
        // duplicate. A corrected payload gets a different fingerprint/key.
        if (mutationFingerprint && response.status < 500 && response.status !== 409) {
          this.clearMutationKey(mutationFingerprint, mutationStorageKey);
        }
        return {
          data: null,
          error: errorData.details || errorData.error || errorData.message || `HTTP Error ${response.status}`,
          status: response.status,
        };
      }

      const data = await response.json();
      if (mutationFingerprint) this.clearMutationKey(mutationFingerprint, mutationStorageKey);
      return {
        data,
        error: null,
        status: response.status,
      };
    } catch (err: any) {
      return {
        data: null,
        error: err.message || 'Network communication failure',
        status: 500,
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async getBlob(endpoint: string): Promise<ApiResponse<Blob>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        credentials: 'same-origin',
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        return { data: null, error: errorData.error || response.statusText, status: response.status };
      }
      return { data: await response.blob(), error: null, status: response.status };
    } catch (error: any) {
      return { data: null, error: error.message || 'Receipt image could not be loaded', status: 500 };
    }
  }

  async post<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
