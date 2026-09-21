import crypto from 'node:crypto';
import path from 'node:path';
import type { DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';
import { MfaService } from '../auth/MfaService';

export interface VendorAttachmentUpload {
  name: string;
  mimeType: string;
  dataBase64: string;
}

export interface VendorAttachmentMetadata {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256Hash: string;
  uploadedBy: string;
  createdAt: string;
}

export interface VendorMail {
  id: string;
  vendorId: string;
  toEmail: string;
  subject: string;
  body: string;
  userId?: string;
  authorName: string;
  status: string;
  createdAt: string;
}

export interface VendorComment {
  id: string;
  body: string;
  userId: string;
  authorName: string;
  createdAt: string;
}

interface ValidatedUpload extends VendorAttachmentMetadata {
  dataBase64: string;
}

const MAX_FILES_PER_UPLOAD = 5;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_VENDOR_BYTES = 20 * 1024 * 1024;
const MAX_VENDOR_FILES = 40;
const MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function sniffMimeType(content: Buffer): string | null {
  if (content.length >= 5 && content.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return 'image/jpeg';
  if (content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (content.length >= 12 && content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export class VendorRecordsService {
  public static validateUploads(input: unknown, userId: string): ValidatedUpload[] {
    if (!Array.isArray(input) || input.length < 1 || input.length > MAX_FILES_PER_UPLOAD) {
      throw new Error('VENDOR_ATTACHMENT_INVALID: Select between one and five PDF or image files.');
    }
    let totalBytes = 0;
    return input.map((entry): ValidatedUpload => {
      if (!entry || typeof entry !== 'object') throw new Error('VENDOR_ATTACHMENT_INVALID: File metadata is invalid.');
      const file = entry as Partial<VendorAttachmentUpload>;
      if (typeof file.name !== 'string' || typeof file.mimeType !== 'string' || typeof file.dataBase64 !== 'string' ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(file.dataBase64)) {
        throw new Error('VENDOR_ATTACHMENT_INVALID: File content is incomplete.');
      }
      const content = Buffer.from(file.dataBase64, 'base64');
      const mimeType = file.mimeType.toLowerCase();
      if (!content.length || content.length > MAX_FILE_BYTES || !MIME_TYPES.has(mimeType) || sniffMimeType(content) !== mimeType) {
        throw new Error('VENDOR_ATTACHMENT_INVALID: Attach a valid PDF, JPEG, PNG, or WebP file under 2 MB.');
      }
      totalBytes += content.length;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error('VENDOR_ATTACHMENT_INVALID: Selected files together must be under 2 MB.');
      const fileName = path.basename(file.name).replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 180) || 'vendor-document';
      return {
        id: newId('vatt'), fileName, mimeType, byteSize: content.length,
        sha256Hash: crypto.createHash('sha256').update(content).digest('hex'),
        uploadedBy: userId, createdAt: new Date().toISOString(), dataBase64: file.dataBase64,
      };
    });
  }

  public static async listAttachments(client: DbQueryClient, organizationId: string, vendorId: string): Promise<VendorAttachmentMetadata[]> {
    const result = await client.query(
      `SELECT id, file_name, mime_type, byte_size, sha256_hash, uploaded_by, created_at
         FROM vendor_attachments
        WHERE organization_id = $1 AND vendor_id = $2 AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC`,
      [organizationId, vendorId]
    );
    return result.rows.map((row: any) => ({
      id: row.id, fileName: row.file_name, mimeType: row.mime_type, byteSize: Number(row.byte_size),
      sha256Hash: row.sha256_hash, uploadedBy: row.uploaded_by, createdAt: row.created_at,
    }));
  }

  public static async addAttachments(
    client: DbQueryClient, organizationId: string, vendorId: string, userId: string, input: unknown
  ): Promise<VendorAttachmentMetadata[]> {
    const uploads = this.validateUploads(input, userId);
    const vendor = await client.query('SELECT active FROM vendors WHERE organization_id = $1 AND id = $2 FOR UPDATE', [organizationId, vendorId]);
    if (!vendor.rows.length) throw new Error('VENDOR_NOT_FOUND: Vendor not found.');
    const usage = await client.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(byte_size), 0)::bigint AS total_bytes
         FROM vendor_attachments WHERE organization_id = $1 AND vendor_id = $2 AND deleted_at IS NULL`,
      [organizationId, vendorId]
    );
    const count = Number(usage.rows[0]?.count || 0);
    const bytes = Number(usage.rows[0]?.total_bytes || 0);
    if (count + uploads.length > MAX_VENDOR_FILES || bytes + uploads.reduce((sum, file) => sum + file.byteSize, 0) > MAX_VENDOR_BYTES) {
      throw new Error('VENDOR_ATTACHMENT_LIMIT: This vendor has reached its attachment storage limit.');
    }
    for (const file of uploads) {
      await client.query(
        `INSERT INTO vendor_attachments (id, organization_id, vendor_id, file_name, mime_type, byte_size, sha256_hash, content_encrypted, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [file.id, organizationId, vendorId, file.fileName, file.mimeType, file.byteSize, file.sha256Hash, MfaService.encryptSecret(file.dataBase64), userId]
      );
    }
    return uploads.map((file) => ({
      id: file.id, fileName: file.fileName, mimeType: file.mimeType, byteSize: file.byteSize,
      sha256Hash: file.sha256Hash, uploadedBy: file.uploadedBy, createdAt: file.createdAt,
    }));
  }

  public static async getAttachment(
    client: DbQueryClient, organizationId: string, vendorId: string, attachmentId: string
  ): Promise<{ fileName: string; mimeType: string; content: Buffer } | null> {
    const result = await client.query(
      `SELECT file_name, mime_type, content_encrypted FROM vendor_attachments
        WHERE organization_id = $1 AND vendor_id = $2 AND id = $3 AND deleted_at IS NULL`,
      [organizationId, vendorId, attachmentId]
    );
    if (!result.rows.length) return null;
    const row = result.rows[0];
    return { fileName: row.file_name, mimeType: row.mime_type, content: Buffer.from(MfaService.decryptSecret(row.content_encrypted), 'base64') };
  }

  public static async archiveAttachment(
    client: DbQueryClient, organizationId: string, vendorId: string, attachmentId: string, userId: string
  ): Promise<boolean> {
    const result = await client.query(
      `UPDATE vendor_attachments SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1
        WHERE organization_id = $2 AND vendor_id = $3 AND id = $4 AND deleted_at IS NULL RETURNING id`,
      [userId, organizationId, vendorId, attachmentId]
    );
    return result.rows.length > 0;
  }

  public static async listComments(client: DbQueryClient, organizationId: string, vendorId: string): Promise<VendorComment[]> {
    const result = await client.query(
      `SELECT c.id, c.body, c.user_id, COALESCE(u.full_name, u.email, c.user_id) AS author_name, c.created_at
         FROM vendor_comments c LEFT JOIN users u ON u.id = c.user_id
        WHERE c.organization_id = $1 AND c.vendor_id = $2
        ORDER BY c.created_at DESC, c.id DESC LIMIT 200`,
      [organizationId, vendorId]
    );
    return result.rows.map((row: any) => ({
      id: row.id, body: row.body, userId: row.user_id, authorName: row.author_name, createdAt: row.created_at,
    }));
  }

  public static async addComment(
    client: DbQueryClient, organizationId: string, vendorId: string, userId: string, input: unknown
  ): Promise<VendorComment> {
    if (typeof input !== 'string' || !input.trim() || input.length > 4000) {
      throw new Error('VENDOR_COMMENT_INVALID: Enter a comment of 1 to 4,000 characters.');
    }
    const vendor = await client.query('SELECT id FROM vendors WHERE organization_id = $1 AND id = $2', [organizationId, vendorId]);
    if (!vendor.rows.length) throw new Error('VENDOR_NOT_FOUND: Vendor not found.');
    const id = newId('vcom');
    const created = await client.query(
      `INSERT INTO vendor_comments (id, organization_id, vendor_id, user_id, body)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, body, user_id, created_at`,
      [id, organizationId, vendorId, userId, input.trim()]
    );
    const row = created.rows[0];
    const user = await client.query('SELECT COALESCE(full_name, email, id) AS author_name FROM users WHERE id = $1', [userId]);
    return { id: row.id, body: row.body, userId: row.user_id, authorName: user.rows[0]?.author_name || userId, createdAt: row.created_at };
  }

  public static async listMails(client: DbQueryClient, organizationId: string, vendorId: string): Promise<VendorMail[]> {
    const result = await client.query(
      `SELECT m.id, m.vendor_id, m.to_email, m.subject, m.body, m.user_id, COALESCE(u.full_name, u.email, m.user_id) AS author_name, m.status, m.created_at
         FROM vendor_mails m LEFT JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = $1 AND m.vendor_id = $2
        ORDER BY m.created_at DESC, m.id DESC LIMIT 200`,
      [organizationId, vendorId]
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      vendorId: row.vendor_id,
      toEmail: row.to_email,
      subject: row.subject,
      body: row.body,
      userId: row.user_id,
      authorName: row.author_name || 'System',
      status: row.status || 'Sent',
      createdAt: row.created_at,
    }));
  }

  public static async sendMail(
    client: DbQueryClient, organizationId: string, vendorId: string, userId: string, payload: { toEmail: string; subject: string; body: string }
  ): Promise<VendorMail> {
    const { toEmail, subject, body } = payload;
    if (!toEmail || !toEmail.includes('@')) throw new Error('VENDOR_MAIL_INVALID: Valid recipient email is required.');
    if (!subject || !subject.trim()) throw new Error('VENDOR_MAIL_INVALID: Email subject is required.');
    if (!body || !body.trim()) throw new Error('VENDOR_MAIL_INVALID: Email message body is required.');
    const vendor = await client.query('SELECT id, name FROM vendors WHERE organization_id = $1 AND id = $2', [organizationId, vendorId]);
    if (!vendor.rows.length) throw new Error('VENDOR_NOT_FOUND: Vendor not found.');
    const id = newId('vmail');
    const created = await client.query(
      `INSERT INTO vendor_mails (id, organization_id, vendor_id, user_id, to_email, subject, body, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Sent')
       RETURNING id, vendor_id, to_email, subject, body, user_id, status, created_at`,
      [id, organizationId, vendorId, userId, toEmail.trim(), subject.trim(), body.trim()]
    );
    const row = created.rows[0];
    const user = await client.query('SELECT COALESCE(full_name, email, id) AS author_name FROM users WHERE id = $1', [userId]);
    return {
      id: row.id,
      vendorId: row.vendor_id,
      toEmail: row.to_email,
      subject: row.subject,
      body: row.body,
      userId: row.user_id,
      authorName: user.rows[0]?.author_name || userId,
      status: row.status,
      createdAt: row.created_at,
    };
  }
}
