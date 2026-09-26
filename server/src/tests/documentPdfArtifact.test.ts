import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DbQueryClient, DbQueryResult } from '../database/db';
import {
  DocumentPdfArtifactConflictError,
  DocumentPdfArtifactIntegrityError,
  DocumentPdfArtifactService,
} from '../services/DocumentPdfArtifactService';

type StoredRow = Record<string, any>;

class MockDb implements DbQueryClient {
  rows: StoredRow[] = [];
  queries: Array<{ sql: string; params: any[] }> = [];

  async query<T = any>(sql: string, params: any[] = []): Promise<DbQueryResult<T>> {
    this.queries.push({ sql, params });
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (normalized.startsWith('insert into document_render_snapshots')) {
      const [id, organization_id, category, document_id, template_version_id, source_data_hash,
        renderModel, pdf_byte_size, issuance_number, idempotency_key, idempotency_payload_hash, source_revision_ref,
        issued_by, issued_at, issuance_reason, filename, pdf_bytes, pdf_sha256] = params;
      const conflict = this.rows.find((row) =>
        row.organization_id === organization_id && row.category === category && row.document_id === document_id && (
          (idempotency_key !== null && row.idempotency_key === idempotency_key) ||
          (row.issuance_number === issuance_number)
        )
      );
      if (conflict) {
        const error: any = new Error('unique violation');
        error.code = '23505';
        error.constraint = idempotency_key !== null && conflict.idempotency_key === idempotency_key
          ? 'uq_doc_render_snapshot_idempotency'
          : 'uq_doc_render_snapshot_issuance';
        throw error;
      }
      const row = {
        id, organization_id, category, document_id, template_version_id, source_data_hash,
        render_model: JSON.parse(renderModel), pdf_byte_size, artifact_state: 'ISSUED',
        issuance_number, idempotency_key, idempotency_payload_hash, source_revision_ref, issued_by,
        issued_at: new Date(issued_at), issuance_reason, filename,
        pdf_bytes: Buffer.isBuffer(pdf_bytes) ? Buffer.from(pdf_bytes) : Buffer.from(pdf_bytes, 'base64'), pdf_sha256, created_at: new Date(),
      };
      this.rows.push(row);
      return { rows: [row as T], rowCount: 1 };
    }

    if (normalized.startsWith('select coalesce(max(issuance_number)')) {
      const matches = this.rows.filter((row) =>
        row.organization_id === params[0] && row.category === params[1] && row.document_id === params[2]
      );
      const max = matches.reduce((value, row) => Math.max(value, Number(row.issuance_number || 0)), 0);
      return { rows: [{ next_issuance_number: max + 1 } as T], rowCount: 1 };
    }

    let matches = this.rows;
    if (normalized.includes('idempotency_key = $4')) {
      matches = matches.filter((row) => row.organization_id === params[0] && row.category === params[1]
        && row.document_id === params[2] && row.idempotency_key === params[3]
        && row.artifact_state === 'ISSUED');
    } else if (normalized.includes('artifact_state = \'issued\'')) {
      matches = matches.filter((row) => row.organization_id === params[0] && row.category === params[1]
        && row.document_id === params[2] && row.artifact_state === 'ISSUED');
      matches = [...matches].sort((a, b) => Number(b.issuance_number) - Number(a.issuance_number));
    } else if (normalized.includes('where organization_id = $1 and id = $2')) {
      matches = matches.filter((row) => row.organization_id === params[0] && row.id === params[1]);
    } else {
      throw new Error(`Unexpected test SQL: ${sql}`);
    }
    return { rows: matches.slice(0, 1) as T[], rowCount: Math.min(matches.length, 1) };
  }
}

const scope = { organizationId: 'org-a', category: 'invoices', documentId: 'invoice-1' };

function input(overrides: Record<string, unknown> = {}) {
  return {
    ...scope,
    issuanceNumber: 1,
    idempotencyKey: 'request-1',
    idempotencyPayloadHash: 'b'.repeat(64),
    templateVersionId: 'template-version-1',
    sourceDataHash: 'source-hash',
    sourceRevisionRef: 'revision-1',
    issuedBy: 'user-1',
    issuedAt: '2026-09-25T10:00:00.000Z',
    issuanceReason: 'Initial issuance',
    filename: 'INV-001.pdf',
    renderModel: { category: 'invoices', total: 125 },
    pdfBytes: Buffer.from([0, 1, 2, 10, 13, 255]),
    ...overrides,
  };
}

function legacyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'legacy-1', organization_id: scope.organizationId, category: scope.category,
    document_id: scope.documentId, template_version_id: null, source_data_hash: 'old-hash',
    render_model: { category: 'invoices' }, pdf_byte_size: 42,
    artifact_state: 'LEGACY_METADATA_ONLY', issuance_number: 1,
    idempotency_key: null, source_revision_ref: null, issued_by: null, issued_at: null,
    issuance_reason: null, filename: null, pdf_bytes: null, pdf_sha256: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'), ...overrides,
  };
}

describe('DocumentPdfArtifactService', () => {
  it('round-trips exact PDF bytes and checks stored SHA-256', async () => {
    const client = new MockDb();
    const inserted = await DocumentPdfArtifactService.insertIssuedArtifact(client, input());
    const loaded = await DocumentPdfArtifactService.findArtifactById(client, scope.organizationId, inserted.id);

    expect(loaded?.pdfBytes).toEqual(input().pdfBytes);
    expect(loaded?.pdfBytes?.equals(input().pdfBytes)).toBe(true);
    expect(loaded?.pdfSha256).toBe(createHash('sha256').update(input().pdfBytes).digest('hex'));

    client.rows[0].pdf_bytes = Buffer.from('tampered');
    await expect(DocumentPdfArtifactService.findArtifactById(client, scope.organizationId, inserted.id))
      .rejects.toBeInstanceOf(DocumentPdfArtifactIntegrityError);
  });

  it('scopes idempotency, latest, and id lookups to the tenant and document identity', async () => {
    const client = new MockDb();
    const artifact = await DocumentPdfArtifactService.insertIssuedArtifact(client, input());

    await expect(DocumentPdfArtifactService.findByIdempotencyKey(client, {
      organizationId: 'org-b', category: scope.category, documentId: scope.documentId, idempotencyKey: 'request-1',
    })).resolves.toBeNull();
    await expect(DocumentPdfArtifactService.findLatestIssuedArtifact(client, {
      ...scope, organizationId: 'org-b',
    })).resolves.toBeNull();
    await expect(DocumentPdfArtifactService.findArtifactById(client, 'org-b', artifact.id)).resolves.toBeNull();

    const lookups = client.queries.filter(({ sql }) => sql.trimStart().toLowerCase().startsWith('select *'));
    expect(lookups).toHaveLength(3);
    for (const query of lookups) expect(query.sql).toMatch(/organization_id\s*=\s*\$1/i);
  });

  it('rejects a conflicting issuance without changing the original row', async () => {
    const client = new MockDb();
    const original = await DocumentPdfArtifactService.insertIssuedArtifact(client, input());
    const originalBytes = Buffer.from(original.pdfBytes!);

    await expect(DocumentPdfArtifactService.insertIssuedArtifact(client, input({ pdfBytes: Buffer.from('replacement') })))
      .rejects.toBeInstanceOf(DocumentPdfArtifactConflictError);
    expect(client.rows).toHaveLength(1);
    expect(client.rows[0].pdf_bytes).toEqual(originalBytes);
  });

  it('enforces idempotency within organization/category/document while allowing other scopes', async () => {
    const client = new MockDb();
    await DocumentPdfArtifactService.insertIssuedArtifact(client, input());
    await expect(DocumentPdfArtifactService.insertIssuedArtifact(client, input({ issuanceNumber: 2 })))
      .rejects.toMatchObject({ name: 'DocumentPdfArtifactConflictError' });

    await expect(DocumentPdfArtifactService.insertIssuedArtifact(client, input({
      organizationId: 'org-b',
    }))).resolves.toMatchObject({ organizationId: 'org-b', idempotencyKey: 'request-1' });
    await expect(DocumentPdfArtifactService.insertIssuedArtifact(client, input({
      documentId: 'invoice-2',
    }))).resolves.toMatchObject({ documentId: 'invoice-2', idempotencyKey: 'request-1' });
    expect(client.rows).toHaveLength(3);
  });

  it('returns legacy metadata without inventing PDF bytes', async () => {
    const client = new MockDb();
    client.rows.push(legacyRow());
    const legacy = await DocumentPdfArtifactService.findArtifactById(client, scope.organizationId, 'legacy-1');

    expect(legacy?.artifactState).toBe('LEGACY_METADATA_ONLY');
    expect(legacy?.issuanceNumber).toBe(1);
    expect(legacy?.pdfByteSize).toBe(42);
    expect(legacy?.pdfBytes).toBeNull();
    expect(legacy?.pdfSha256).toBeNull();
  });

  it('computes the next number from only the scoped document sequence', async () => {
    const client = new MockDb();
    client.rows.push(
      legacyRow({ id: 'legacy-2', issuance_number: 2 }),
      legacyRow({ id: 'other-tenant', organization_id: 'org-b', issuance_number: 50 }),
      legacyRow({ id: 'other-document', document_id: 'invoice-2', issuance_number: 20 })
    );

    await expect(DocumentPdfArtifactService.computeNextIssuanceNumber(client, scope)).resolves.toBe(3);
    const query = client.queries[0];
    expect(query.sql).toMatch(/organization_id\s*=\s*\$1/i);
    expect(query.params).toEqual([scope.organizationId, scope.category, scope.documentId]);
  });
});
