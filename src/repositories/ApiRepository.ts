import { apiClient } from '../api/client';
import { BaseRepository } from './types';
import { LocalStorageEntityRepository } from './LocalStorageRepository';

export class ApiEntityRepository<T extends { id: string; organizationId?: string }>
  implements BaseRepository<T>
{
  private endpoint: string;
  private fallbackRepo: LocalStorageEntityRepository<T>;

  constructor(
    entityKey: string,
    endpoint: string,
    defaultDataGetter: () => T[]
  ) {
    this.endpoint = endpoint;
    this.fallbackRepo = new LocalStorageEntityRepository<T>(entityKey, defaultDataGetter);
  }

  async getAllAsync(orgId: string): Promise<T[]> {
    const res = await apiClient.get<T[]>(`/${this.endpoint}`);
    if (res.data && Array.isArray(res.data) && res.data.length > 0) {
      return res.data;
    }
    return this.fallbackRepo.getAll(orgId);
  }

  getAll(orgId: string): T[] {
    // Synchronous fallback wrapper for Context compatibility
    return this.fallbackRepo.getAll(orgId);
  }

  getById(orgId: string, id: string): T | null {
    return this.fallbackRepo.getById(orgId, id);
  }

  saveAll(orgId: string, items: T[]): void {
    this.fallbackRepo.saveAll(orgId, items);
  }

  create(orgId: string, item: Omit<T, 'id'>): T {
    const local = this.fallbackRepo.create(orgId, item);
    // Asynchronously dispatch to Express PostgreSQL backend
    apiClient.post(`/${this.endpoint}`, item).catch((err) => {
      console.warn(`[ApiRepository] Post to /${this.endpoint} pending server sync:`, err);
    });
    return local;
  }

  update(orgId: string, id: string, updates: Partial<T>): T | null {
    const local = this.fallbackRepo.update(orgId, id, updates);
    apiClient.put(`/${this.endpoint}/${id}`, updates).catch((err) => {
      console.warn(`[ApiRepository] Put to /${this.endpoint}/${id} pending server sync:`, err);
    });
    return local;
  }

  delete(orgId: string, id: string): boolean {
    const local = this.fallbackRepo.delete(orgId, id);
    apiClient.delete(`/${this.endpoint}/${id}`).catch((err) => {
      console.warn(`[ApiRepository] Delete to /${this.endpoint}/${id} pending server sync:`, err);
    });
    return local;
  }
}
