import { createHash } from 'node:crypto';
import { db, type DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';

export type DocumentPdfArtifactState = 'LEGACY_METADATA_ONLY' | 'ISSUED';

export interface DocumentPdfArtifact {
  id: string;
  organizationId: string;
  category: string;
  documentId: string;
  templateVersionId: string | null;
  sourceDataHash: string;
  renderModel: Record<string, unknown>;
  pdfByteSize: number;
  artifactState: DocumentPdfArtifactState;
  issuanceNumber: number | null;
  idempotencyKey: string | null;
  idempotencyPayloadHash: string | null;
  sourceRevisionRef: string | null;
  issuedBy: string | null;
  issuedAt: Date | null;
  issuanceReason: string | null;
  filename: string | null;
  pdfBytes: Buffer | null;
  pdfSha256: string | null;
  createdAt: Date | null;
}

export interface DocumentPdfArtifactScope {
  organizationId: string;
  category: string;
  documentId: string;
}

/**
 * The caller must pass a sanitized render model and run this insert inside its
 * issuance transaction. It owns document locking and supplies the allocated
 * issuance number; the bytes are stored exactly as provided.
 */
export interface InsertIssuedDocumentPdfArtifactInput extends DocumentPdfArtifactScope {
  issuanceNumber: number;
  idempotencyKey: string | null;
  idempotencyPayloadHash: string;
  templateVersionId: string | null;
  sourceDataHash: string;
  sourceRevisionRef: string | null;
  issuedBy: string;
  issuedAt: Date | string;
  issuanceReason: string | null;
  filename: string;
  renderModel: Record<string, unknown>;
  pdfBytes: Buffer;
}

interface DocumentPdfArtifactRow {
  id: string;
  organization_id: string;
  category: string;
  document_id: string;
  template_version_id: string | null;
  source_data_hash: string;
  render_model: Record<string, unknown> | string;
  pdf_byte_size: number;
  artifact_state: DocumentPdfArtifactState;
  issuance_number: number | null;
  idempotency_key: string | null;
  idempotency_payload_hash: string | null;
  source_revision_ref: string | null;
  issued_by: string | null;
  issued_at: Date | string | null;
  issuance_reason: string | null;
  filename: string | null;
  pdf_bytes: Buffer | Uint8Array | null;
  pdf_sha256: string | null;
  created_at: Date | string | null;
}

export class DocumentPdfArtifactIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentPdfArtifactIntegrityError';
  }
}

export class DocumentPdfArtifactConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentPdfArtifactConflictError';
  }
}

export class DocumentPdfArtifactService {
  public static async findByIdempotencyKey(
    client: DbQueryClient,
    scope: DocumentPdfArtifactScope & { idempotencyKey: string }
  ): Promise<DocumentPdfArtifact | null> {
    const result = await client.query<DocumentPdfArtifactRow>(
      `SELECT * FROM document_render_snapshots
        WHERE organization_id = $1 AND category = $2 AND document_id = $3
          AND idempotency_key = $4 AND artifact_state = 'ISSUED'
        LIMIT 1`,
      [scope.organizationId, scope.category, scope.documentId, scope.idempotencyKey]
    );
    return this.toArtifact(result.rows[0]);
  }

  public static async findLatestIssuedArtifact(
    client: DbQueryClient,
    scope: DocumentPdfArtifactScope
  ): Promise<DocumentPdfArtifact | null> {
    const result = await client.query<DocumentPdfArtifactRow>(
      `SELECT * FROM document_render_snapshots
        WHERE organization_id = $1 AND category = $2 AND document_id = $3
          AND artifact_state = 'ISSUED'
        ORDER BY issuance_number DESC, issued_at DESC, id DESC
        LIMIT 1`,
      [scope.organizationId, scope.category, scope.documentId]
    );
    return this.toArtifact(result.rows[0]);
  }

  public static async findArtifactById(
    client: DbQueryClient,
    organizationId: string,
    artifactId: string
  ): Promise<DocumentPdfArtifact | null> {
    const result = await client.query<DocumentPdfArtifactRow>(
      `SELECT * FROM document_render_snapshots
        WHERE organization_id = $1 AND id = $2
        LIMIT 1`,
      [organizationId, artifactId]
    );
    return this.toArtifact(result.rows[0]);
  }

  /** The caller must hold the document-level lock before computing this value. */
  public static async computeNextIssuanceNumber(
    client: DbQueryClient,
    scope: DocumentPdfArtifactScope
  ): Promise<number> {
    const result = await client.query<{ next_issuance_number: number | string }>(
      `SELECT COALESCE(MAX(issuance_number), 0) + 1 AS next_issuance_number
         FROM document_render_snapshots
        WHERE organization_id = $1 AND category = $2 AND document_id = $3`,
      [scope.organizationId, scope.category, scope.documentId]
    );
    const next = Number(result.rows[0]?.next_issuance_number ?? 1);
    if (!Number.isSafeInteger(next) || next < 1) {
      throw new DocumentPdfArtifactIntegrityError('Invalid next issuance number returned by storage');
    }
    return next;
  }

  public static async insertIssuedArtifact(
    client: DbQueryClient,
    input: InsertIssuedDocumentPdfArtifactInput
  ): Promise<DocumentPdfArtifact> {
    if (!Buffer.isBuffer(input.pdfBytes)) {
      throw new TypeError('Issued PDF bytes must be a Buffer');
    }
    if (!Number.isSafeInteger(input.issuanceNumber) || input.issuanceNumber < 1) {
      throw new TypeError('Issuance number must be a positive safe integer');
    }
    if (!/^[a-f0-9]{64}$/i.test(input.idempotencyPayloadHash)) {
      throw new TypeError('Idempotency payload hash must be a SHA-256 hex digest');
    }

    const pdfSha256 = createHash('sha256').update(input.pdfBytes).digest('hex');
    let result;
    try {
      result = await client.query<DocumentPdfArtifactRow>(
        `INSERT INTO document_render_snapshots
          (id, organization_id, category, document_id, template_version_id,
           source_data_hash, render_model, pdf_byte_size, artifact_state,
           issuance_number, idempotency_key, idempotency_payload_hash, source_revision_ref, issued_by,
           issued_at, issuance_reason, filename, pdf_bytes, pdf_sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ISSUED', $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [
          newId('pdf_artifact'), input.organizationId, input.category, input.documentId,
          input.templateVersionId, input.sourceDataHash, JSON.stringify(input.renderModel),
          input.pdfBytes.length, input.issuanceNumber, input.idempotencyKey, input.idempotencyPayloadHash,
          input.sourceRevisionRef, input.issuedBy, input.issuedAt, input.issuanceReason,
          input.filename, db.isMemoryMode() ? input.pdfBytes.toString('base64') : input.pdfBytes, pdfSha256,
        ]
      );
    } catch (error) {
      const pgError = error as { code?: string; constraint?: string };
      if (pgError.code === '23505') {
        const reason = pgError.constraint === 'uq_doc_render_snapshot_idempotency'
          ? 'Idempotency key already belongs to an issued artifact'
          : 'Issuance identity already exists';
        throw new DocumentPdfArtifactConflictError(reason);
      }
      throw error;
    }

    if (!result.rows[0]) {
      throw new DocumentPdfArtifactIntegrityError('Issued PDF artifact insert returned no row');
    }
    return this.toArtifact(result.rows[0])!;
  }

  private static toArtifact(row: DocumentPdfArtifactRow | undefined): DocumentPdfArtifact | null {
    if (!row) return null;
    let renderModel: Record<string, unknown>;
    try {
      renderModel = typeof row.render_model === 'string' ? JSON.parse(row.render_model) : row.render_model;
    } catch {
      throw new DocumentPdfArtifactIntegrityError('Stored render model is invalid JSON');
    }

    const bytes = row.pdf_bytes == null ? null : typeof row.pdf_bytes === 'string'
      ? Buffer.from(row.pdf_bytes, 'base64')
      : Buffer.from(row.pdf_bytes);
    if (row.artifact_state === 'ISSUED') {
      if (!bytes || !row.pdf_sha256) {
        throw new DocumentPdfArtifactIntegrityError('Issued PDF artifact is missing stored bytes or SHA-256');
      }
      if (bytes.length !== Number(row.pdf_byte_size)) {
        throw new DocumentPdfArtifactIntegrityError('Stored PDF byte length does not match its recorded size');
      }
      const actualHash = createHash('sha256').update(bytes).digest('hex');
      if (actualHash !== row.pdf_sha256.toLowerCase()) {
        throw new DocumentPdfArtifactIntegrityError('Stored PDF bytes do not match their SHA-256');
      }
    } else if (bytes !== null || row.pdf_sha256 !== null) {
      throw new DocumentPdfArtifactIntegrityError('Legacy metadata-only snapshot unexpectedly contains PDF bytes');
    }

    return {
      id: row.id,
      organizationId: row.organization_id,
      category: row.category,
      documentId: row.document_id,
      templateVersionId: row.template_version_id,
      sourceDataHash: row.source_data_hash,
      renderModel,
      pdfByteSize: Number(row.pdf_byte_size),
      artifactState: row.artifact_state,
      issuanceNumber: row.issuance_number == null ? null : Number(row.issuance_number),
      idempotencyKey: row.idempotency_key,
      idempotencyPayloadHash: row.idempotency_payload_hash,
      sourceRevisionRef: row.source_revision_ref,
      issuedBy: row.issued_by,
      issuedAt: row.issued_at == null ? null : new Date(row.issued_at),
      issuanceReason: row.issuance_reason,
      filename: row.filename,
      pdfBytes: bytes,
      pdfSha256: row.pdf_sha256,
      createdAt: row.created_at == null ? null : new Date(row.created_at),
    };
  }
}
