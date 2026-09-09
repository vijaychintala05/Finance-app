import fs from 'node:fs/promises';
import path from 'node:path';
import { StorageProvider, StoragePutResult } from './StorageProvider';

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;
  private baseUrl: string;

  constructor(baseDir: string = path.resolve(process.cwd(), 'storage/uploads'), baseUrl: string = '/storage') {
    this.baseDir = path.normalize(baseDir);
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private resolveSafePath(key: string): string {
    const normalizedKey = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.resolve(this.baseDir, normalizedKey);
    if (!fullPath.startsWith(this.baseDir)) {
      throw new Error('STORAGE_PATH_TRAVERSAL: Invalid storage key');
    }
    return fullPath;
  }

  public async putObject(key: string, data: Buffer, _mimeType: string): Promise<StoragePutResult> {
    const fullPath = this.resolveSafePath(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);

    return {
      key,
      byteSize: data.length,
      url: this.getPublicUrl(key),
    };
  }

  public async getObject(key: string): Promise<Buffer> {
    const fullPath = this.resolveSafePath(key);
    try {
      return await fs.readFile(fullPath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(`STORAGE_NOT_FOUND: Object '${key}' does not exist`);
      }
      throw err;
    }
  }

  public async deleteObject(key: string): Promise<void> {
    const fullPath = this.resolveSafePath(key);
    try {
      await fs.unlink(fullPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  public async hasObject(key: string): Promise<boolean> {
    const fullPath = this.resolveSafePath(key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  public getPublicUrl(key: string): string {
    const normalized = key.replace(/\\/g, '/').replace(/^\//, '');
    return `${this.baseUrl}/${normalized}`;
  }
}
