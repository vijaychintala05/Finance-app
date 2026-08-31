import path from 'node:path';
import { newId } from '../utils/ids';
import type { DbQueryClient } from '../database/db';

export interface ExpenseReceiptUpload {
  name: string;
  mimeType: string;
  dataBase64: string;
}

export interface ExpenseReceiptMetadata {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
}

interface ValidatedReceipt extends ExpenseReceiptMetadata {
  dataBase64: string;
}

const MAX_RECEIPTS_PER_EXPENSE = 3;
const MAX_RECEIPT_BYTES = 900 * 1024;
const MAX_TOTAL_RECEIPT_BYTES = 2 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function mimeTypeForImage(content: Buffer): string | null {
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return 'image/jpeg';
  if (content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (content.length >= 12 && content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export class ExpenseReceiptService {
  public static validateUploads(input: unknown): ValidatedReceipt[] {
    if (input === undefined || input === null) return [];
    if (!Array.isArray(input) || input.length > MAX_RECEIPTS_PER_EXPENSE) {
      throw new Error('EXPENSE_RECEIPT_INVALID: Attach up to three receipt images.');
    }

    let totalBytes = 0;
    return input.map((entry): ValidatedReceipt => {
      if (!entry || typeof entry !== 'object') throw new Error('EXPENSE_RECEIPT_INVALID: Receipt image is invalid.');
      const upload = entry as Partial<ExpenseReceiptUpload>;
      if (typeof upload.name !== 'string' || typeof upload.mimeType !== 'string' || typeof upload.dataBase64 !== 'string') {
        throw new Error('EXPENSE_RECEIPT_INVALID: Receipt image is incomplete.');
      }
      const mimeType = upload.mimeType.toLowerCase();
      if (!ACCEPTED_MIME_TYPES.has(mimeType) || !/^[A-Za-z0-9+/]*={0,2}$/.test(upload.dataBase64)) {
        throw new Error('EXPENSE_RECEIPT_INVALID: Use a JPEG, PNG, or WebP receipt image.');
      }
      const content = Buffer.from(upload.dataBase64, 'base64');
      if (!content.length || content.length > MAX_RECEIPT_BYTES || mimeTypeForImage(content) !== mimeType) {
        throw new Error('EXPENSE_RECEIPT_INVALID: Each receipt image must be a valid image under 900 KB.');
      }
      totalBytes += content.length;
      if (totalBytes > MAX_TOTAL_RECEIPT_BYTES) {
        throw new Error('EXPENSE_RECEIPT_INVALID: Receipt images together must be under 2 MB.');
      }
      const baseName = path.basename(upload.name).replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 180) || 'receipt-image';
      return { id: newId('rcpt'), fileName: baseName, mimeType, byteSize: content.length, dataBase64: upload.dataBase64 };
    });
  }

  public static async attachToExpense(
    client: DbQueryClient,
    organizationId: string,
    expenseId: string,
    receipts: ValidatedReceipt[]
  ): Promise<ExpenseReceiptMetadata[]> {
    for (const receipt of receipts) {
      await client.query(
        `INSERT INTO expense_receipt_attachments
          (id, organization_id, expense_id, file_name, mime_type, byte_size, content_base64)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [receipt.id, organizationId, expenseId, receipt.fileName, receipt.mimeType, receipt.byteSize, receipt.dataBase64]
      );
    }
    return receipts.map(({ id, fileName, mimeType, byteSize }) => ({ id, fileName, mimeType, byteSize }));
  }

  public static async listForExpenses(client: DbQueryClient, organizationId: string): Promise<Map<string, ExpenseReceiptMetadata[]>> {
    const result = await client.query(
      `SELECT id, expense_id, file_name, mime_type, byte_size
         FROM expense_receipt_attachments
        WHERE organization_id = $1
        ORDER BY created_at ASC`,
      [organizationId]
    );
    const byExpense = new Map<string, ExpenseReceiptMetadata[]>();
    for (const row of result.rows) {
      const attachments = byExpense.get(row.expense_id) || [];
      attachments.push({ id: row.id, fileName: row.file_name, mimeType: row.mime_type, byteSize: Number(row.byte_size) });
      byExpense.set(row.expense_id, attachments);
    }
    return byExpense;
  }

  public static async getContent(client: DbQueryClient, organizationId: string, expenseId: string, receiptId: string): Promise<{ fileName: string; mimeType: string; content: Buffer } | null> {
    const result = await client.query(
      `SELECT file_name, mime_type, content_base64
         FROM expense_receipt_attachments
        WHERE organization_id = $1 AND expense_id = $2 AND id = $3`,
      [organizationId, expenseId, receiptId]
    );
    if (!result.rows.length) return null;
    const row = result.rows[0];
    return { fileName: row.file_name, mimeType: row.mime_type, content: Buffer.from(row.content_base64, 'base64') };
  }
}
