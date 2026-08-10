import { OrganizationMeta, FirmSettings } from '../types';
import { initialSettings } from '../services/seedData';
import { BaseRepository, IOrganizationRepository, ISettingsRepository } from './types';

const ORG_STORAGE_KEY = 'firmbooks_organizations_v2';

export class LocalStorageOrganizationRepository implements IOrganizationRepository {
  getOrganizations(): OrganizationMeta[] {
    try {
      const raw = localStorage.getItem(ORG_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to parse organizations from localStorage', e);
    }
    return [];
  }

  saveOrganizations(orgs: OrganizationMeta[]): void {
    try {
      localStorage.setItem(ORG_STORAGE_KEY, JSON.stringify(orgs));
    } catch (e) {
      console.error('Failed to save organizations to localStorage', e);
    }
  }

  getById(id: string): OrganizationMeta | null {
    const orgs = this.getOrganizations();
    return orgs.find((o) => o.id === id) || null;
  }
}

export class LocalStorageSettingsRepository implements ISettingsRepository {
  getSettings(orgId: string): FirmSettings {
    try {
      const raw = localStorage.getItem(`firmbooks_settings_${orgId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to load settings from localStorage', e);
    }
    return initialSettings;
  }

  saveSettings(orgId: string, settings: FirmSettings): void {
    try {
      localStorage.setItem(`firmbooks_settings_${orgId}`, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings to localStorage', e);
    }
  }
}

export class LocalStorageEntityRepository<T extends { id: string; organizationId?: string }>
  implements BaseRepository<T>
{
  private entityKey: string;
  private defaultDataGetter: () => T[];

  constructor(entityKey: string, defaultDataGetter: () => T[]) {
    this.entityKey = entityKey;
    this.defaultDataGetter = defaultDataGetter;
  }

  private getStorageKey(orgId: string): string {
    return `firmbooks_${this.entityKey}_${orgId}`;
  }

  getAll(orgId: string): T[] {
    try {
      const raw = localStorage.getItem(this.getStorageKey(orgId));
      if (raw) {
        const items: T[] = JSON.parse(raw);
        return items.map((item) => ({ ...item, organizationId: item.organizationId || orgId }));
      }
    } catch (e) {
      console.error(`Failed to load ${this.entityKey} from localStorage`, e);
    }
    const defaults = this.defaultDataGetter();
    const seeded = defaults.map((item) => ({ ...item, organizationId: orgId }));
    this.saveAll(orgId, seeded);
    return seeded;
  }

  getById(orgId: string, id: string): T | null {
    const items = this.getAll(orgId);
    return items.find((i) => i.id === id) || null;
  }

  saveAll(orgId: string, items: T[]): void {
    try {
      const taggedItems = items.map((item) => ({ ...item, organizationId: orgId }));
      localStorage.setItem(this.getStorageKey(orgId), JSON.stringify(taggedItems));
    } catch (e) {
      console.error(`Failed to save ${this.entityKey} to localStorage`, e);
    }
  }

  create(orgId: string, item: Omit<T, 'id'>): T {
    const items = this.getAll(orgId);
    const newItem = {
      ...item,
      id: `${this.entityKey.slice(0, 3)}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      organizationId: orgId,
    } as unknown as T;
    items.unshift(newItem);
    this.saveAll(orgId, items);
    return newItem;
  }

  update(orgId: string, id: string, updates: Partial<T>): T | null {
    const items = this.getAll(orgId);
    const index = items.findIndex((i) => i.id === id);
    if (index === -1) return null;
    const updated = { ...items[index], ...updates };
    items[index] = updated;
    this.saveAll(orgId, items);
    return updated;
  }

  delete(orgId: string, id: string): boolean {
    const items = this.getAll(orgId);
    const filtered = items.filter((i) => i.id !== id);
    if (filtered.length === items.length) return false;
    this.saveAll(orgId, filtered);
    return true;
  }
}
