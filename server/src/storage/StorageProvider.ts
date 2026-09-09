export interface StoragePutResult {
  key: string;
  byteSize: number;
  url: string;
}

export interface StorageProvider {
  putObject(key: string, data: Buffer, mimeType: string): Promise<StoragePutResult>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  hasObject(key: string): Promise<boolean>;
  getPublicUrl(key: string): string;
}
