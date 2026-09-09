export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class StaticMetadataCache {
  private static cache = new Map<string, CacheEntry<any>>();
  private static DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static invalidationListeners: Array<(orgId: string, keyPrefix?: string) => void> = [];
  private static hits = 0;
  private static misses = 0;

  private static buildKey(orgId: string, key: string): string {
    return `${orgId}::${key}`;
  }

  public static get<T>(orgId: string, key: string): T | undefined {
    const fullKey = this.buildKey(orgId, key);
    const entry = this.cache.get(fullKey);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(fullKey);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.value as T;
  }

  public static set<T>(orgId: string, key: string, value: T, ttlMs?: number): void {
    const fullKey = this.buildKey(orgId, key);
    const ttl = ttlMs !== undefined ? ttlMs : this.DEFAULT_TTL_MS;
    this.cache.set(fullKey, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  public static invalidate(orgId: string, keyPrefix?: string): void {
    const orgPrefix = `${orgId}::`;
    const searchPrefix = keyPrefix ? `${orgId}::${keyPrefix}` : orgPrefix;

    for (const key of this.cache.keys()) {
      if (key.startsWith(searchPrefix)) {
        this.cache.delete(key);
      }
    }

    // Broadcast invalidation event to distributed listeners
    for (const listener of this.invalidationListeners) {
      try {
        listener(orgId, keyPrefix);
      } catch {
        // Safe listener execution
      }
    }
  }

  public static onInvalidate(listener: (orgId: string, keyPrefix?: string) => void): () => void {
    this.invalidationListeners.push(listener);
    return () => {
      const idx = this.invalidationListeners.indexOf(listener);
      if (idx !== -1) this.invalidationListeners.splice(idx, 1);
    };
  }

  public static getStats(): { hits: number; misses: number; size: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
    };
  }

  public static resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  public static clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  public static size(): number {
    return this.cache.size;
  }
}
