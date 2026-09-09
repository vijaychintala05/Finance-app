import crypto from 'node:crypto';
import path from 'node:path';
import { StorageProvider, StoragePutResult } from './StorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';

export interface UploadMetadata extends StoragePutResult {
  fileName: string;
  mimeType: string;
  sha256Hash: string;
}

export class StorageService {
  private static instance: StorageProvider = new LocalStorageProvider();

  public static getProvider(): StorageProvider {
    return this.instance;
  }

  public static setProvider(provider: StorageProvider): void {
    this.instance = provider;
  }

  public static resetDefaultProvider(): void {
    this.instance = new LocalStorageProvider();
  }

  public static sanitizeFileName(fileName: string): string {
    return path.basename(fileName).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || 'file.bin';
  }

  public static async uploadAttachment(
    organizationId: string,
    category: string,
    fileName: string,
    data: Buffer,
    mimeType: string
  ): Promise<UploadMetadata> {
    if (!organizationId) throw new Error('STORAGE_ORG_REQUIRED: organizationId is required');
    if (!data || data.length === 0) throw new Error('STORAGE_EMPTY_DATA: Cannot upload empty buffer');

    const safeName = this.sanitizeFileName(fileName);
    const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
    const dateStr = new Date().toISOString().slice(0, 7); // YYYY-MM
    const key = `attachments/${organizationId}/${category}/${dateStr}/${hash}_${safeName}`;

    const res = await this.instance.putObject(key, data, mimeType);

    return {
      ...res,
      fileName: safeName,
      mimeType,
      sha256Hash: crypto.createHash('sha256').update(data).digest('hex'),
    };
  }

  public static async downloadAttachment(key: string): Promise<Buffer> {
    return await this.instance.getObject(key);
  }

  public static async deleteAttachment(key: string): Promise<void> {
    await this.instance.deleteObject(key);
  }

  public static async hasAttachment(key: string): Promise<boolean> {
    return await this.instance.hasObject(key);
  }
}
