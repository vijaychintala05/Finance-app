import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { StorageService } from '../storage/StorageService';
import { LocalStorageProvider } from '../storage/LocalStorageProvider';

describe('Weakness Remediation 1: Pluggable Object Storage Architecture', () => {
  const testDir = path.resolve(process.cwd(), 'storage/test-storage-tmp');
  const orgId = 'org-storage-test-001';

  beforeEach(async () => {
    StorageService.setProvider(new LocalStorageProvider(testDir, '/test-cdn'));
  });

  afterAll(async () => {
    StorageService.resetDefaultProvider();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('1. Uploads file buffer, computes content hash, and returns accessible URL', async () => {
    const payload = Buffer.from('PDF_INVOICE_RECEIPT_MOCK_CONTENT_12345');
    const upload = await StorageService.uploadAttachment(
      orgId,
      'expenses',
      'hotel_receipt.pdf',
      payload,
      'application/pdf'
    );

    expect(upload.key).toContain(`attachments/${orgId}/expenses/`);
    expect(upload.key).toContain('hotel_receipt.pdf');
    expect(upload.byteSize).toBe(payload.length);
    expect(upload.url).toContain('/test-cdn/attachments/');
    expect(upload.sha256Hash).toHaveLength(64);

    // Download and verify content
    const downloaded = await StorageService.downloadAttachment(upload.key);
    expect(downloaded.toString()).toBe('PDF_INVOICE_RECEIPT_MOCK_CONTENT_12345');
  });

  it('2. Prevents path traversal security vulnerabilities in storage keys', async () => {
    const provider = StorageService.getProvider();
    await expect(
      provider.getObject('../../../etc/passwd')
    ).rejects.toThrow();
  });

  it('3. Successfully verifies existence and deletes stored attachments', async () => {
    const payload = Buffer.from('AVATAR_IMAGE_DATA');
    const upload = await StorageService.uploadAttachment(
      orgId,
      'avatars',
      'user_pic.png',
      payload,
      'image/png'
    );

    expect(await StorageService.hasAttachment(upload.key)).toBe(true);

    await StorageService.deleteAttachment(upload.key);

    expect(await StorageService.hasAttachment(upload.key)).toBe(false);

    await expect(
      StorageService.downloadAttachment(upload.key)
    ).rejects.toThrow('STORAGE_NOT_FOUND');
  });
});
