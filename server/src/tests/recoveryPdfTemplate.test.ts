import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../database/migrationRunner';
import { RecoveryArtifactService } from '../recovery/RecoveryArtifactService';
import { decodeRecoveryPdfRow, encodeRecoveryPdfRow, POINT1_RECOVERY_SCHEMA, POINT1_RECOVERY_SCHEMA_V15, POINT1_RECOVERY_SCHEMA_V16 } from '../recovery/schema';
import { RecoveryMigrationPolicy } from '../recovery/RecoveryMigrationPolicy';
import { RECOVERY_FORMAT, RECOVERY_FORMAT_VERSION, type RecoveryEnvelope, type RecoveryManifest, type RecoveryPayload, type RecoveryKeyring, type StoredRecoveryArtifact } from '../recovery/types';
import { sealRecoveryPayload, sha256 } from '../recovery/crypto';
import { SqlRecoveryPromoter } from '../recovery/ProductionRecoveryAdapters';

const organizationId = 'org-recovery-v16';
const keyring: RecoveryKeyring = {
  activeKeyId: 'recovery-test-v1',
  encryptionKeys: { 'recovery-test-v1': Buffer.alloc(32, 7) },
  hmacKeys: { 'recovery-test-v1': Buffer.alloc(32, 9) },
};

describe('PDF template and issued-artifact recovery', () => {
  it('keeps v15 and v16 snapshots frozen and orders new tables parent-first', () => {
    expect(Object.isFrozen(POINT1_RECOVERY_SCHEMA_V15)).toBe(true);
    expect(Object.isFrozen(POINT1_RECOVERY_SCHEMA_V16)).toBe(true);
    expect(POINT1_RECOVERY_SCHEMA_V16.some((table) => table.name === 'document_templates')).toBe(false);
    expect(POINT1_RECOVERY_SCHEMA_V16.find((table) => table.name === 'organization_profiles')?.columns).not.toContain('branding');

    const names = POINT1_RECOVERY_SCHEMA.map((table) => table.name);
    expect(names.indexOf('document_templates')).toBeLessThan(names.indexOf('document_template_versions'));
    expect(names.indexOf('document_templates')).toBeLessThan(names.indexOf('document_template_assignments'));
    expect(names.indexOf('document_template_versions')).toBeLessThan(names.indexOf('document_render_snapshots'));
    expect(POINT1_RECOVERY_SCHEMA.find((table) => table.name === 'organization_profiles')?.columns).toEqual(
      expect.arrayContaining(['branding', 'document_templates']),
    );
  });

  it('scopes template-version recovery through the owning tenant template', () => {
    const versions = POINT1_RECOVERY_SCHEMA.find((table) => table.name === 'document_template_versions')!;
    expect(versions.selectSql).toMatch(/JOIN document_templates t ON t.id = v.template_id/i);
    expect(versions.selectSql).toMatch(/t\.organization_id = \$1/i);
    expect(versions.deleteSql).toMatch(/template_id IN .*organization_id = \$1/i);
    expect(versions.tenantColumn).toBeUndefined();
  });

  it('upcasts a sealed v16 artifact with null profile additions and empty template/artifact tables', async () => {
    const v16 = RecoveryMigrationPolicy.V16_SCHEMA_VERSION;
    const tables: Record<string, Record<string, unknown>[]> = Object.fromEntries(
      POINT1_RECOVERY_SCHEMA_V16.map((table) => [table.name, []]),
    );
    const profile = Object.fromEntries(
      POINT1_RECOVERY_SCHEMA_V16.find((table) => table.name === 'organization_profiles')!.columns.map((column) => [column, null]),
    );
    profile.organization_id = organizationId;
    tables.organization_profiles = [profile];
    const legacyInvoice = Object.fromEntries(
      POINT1_RECOVERY_SCHEMA_V16.find((table) => table.name === 'invoices')!.columns.map((column) => [column, null]),
    );
    Object.assign(legacyInvoice, { id: 'invoice-v16', organization_id: organizationId, invoice_number: 'INV-V16' });
    tables.invoices = [legacyInvoice];

    const payload: RecoveryPayload = { organizationId, schemaVersion: v16, tables };
    const createdAt = new Date('2026-09-24T12:00:00.000Z').toISOString();
    const manifest: RecoveryManifest = {
      format: RECOVERY_FORMAT,
      formatVersion: RECOVERY_FORMAT_VERSION,
      artifactId: 'artifact-v16',
      organizationId,
      schemaVersion: v16,
      createdBy: 'owner-v16',
      createdAt,
      keyId: keyring.activeKeyId,
      cipher: 'aes-256-gcm',
      tables: POINT1_RECOVERY_SCHEMA_V16.map((table) => ({
        name: table.name,
        columns: [...table.columns],
        rowCount: tables[table.name].length,
        sha256: sha256(tables[table.name]),
      })),
    };
    const artifact: StoredRecoveryArtifact = {
      id: manifest.artifactId,
      organizationId,
      status: 'READY',
      envelope: sealRecoveryPayload(manifest, payload, keyring),
      createdBy: manifest.createdBy,
      createdAt,
    };
    let staged: RecoveryPayload | undefined;
    const repository = {
      getArtifact: async () => artifact,
      createJob: async () => {},
      setJobValidated: async () => {},
      setJobFailed: async () => {},
    };
    const service = new RecoveryArtifactService({
      repository: repository as any,
      keyring,
      stager: { stage: async ({ payload: stagedPayload }) => { staged = stagedPayload; } },
      reconcilers: [{ name: 'test', reconcile: async () => ({ name: 'test', passed: true }) }],
      ownerAuthorizer: { assertOwner: async () => {} },
      promoter: { promote: async () => {} },
      transactionManager: { transaction: async (callback: (client: any) => Promise<any>) => callback({}) },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    const result = await service.stageRestore({ artifactId: artifact.id, targetOrganizationId: organizationId, requestedBy: 'owner-v16' });
    expect(result.status).toBe('VALIDATED');
    expect(staged?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(staged?.tables.organization_profiles[0]).toMatchObject({ branding: null, document_templates: null });
    expect(staged?.tables.document_templates).toEqual([]);
    expect(staged?.tables.document_template_versions).toEqual([]);
    expect(staged?.tables.document_template_assignments).toEqual([]);
    expect(staged?.tables.document_render_snapshots).toEqual([]);
    expect(staged?.tables.invoices[0]).toMatchObject({
      id: 'invoice-v16', edit_version: 1, line_items: null, customer_snapshot: null,
      is_gst_inclusive: null, terms: null, edit_history: null, salesperson_id: null,
      salesperson_name_snapshot: null, salesperson_code_snapshot: null, commission_rate_snapshot: null,
    });
  });

  it('re-seeds the default template registry when promoting a legacy payload with no template tables', async () => {
    const v16 = RecoveryMigrationPolicy.V16_SCHEMA_VERSION;
    const tables: Record<string, Record<string, unknown>[]> = Object.fromEntries(POINT1_RECOVERY_SCHEMA_V16.map((table) => [table.name, []]));
    const profileColumns = POINT1_RECOVERY_SCHEMA_V16.find((table) => table.name === 'organization_profiles')!.columns;
    const profile = Object.fromEntries(profileColumns.map((column) => [column, null]));
    profile.organization_id = organizationId;
    tables.organization_profiles = [profile];
    const upgraded = RecoveryMigrationPolicy.evaluateAndMigrate({
      format: RECOVERY_FORMAT, formatVersion: RECOVERY_FORMAT_VERSION, artifactId: 'artifact-legacy-templates',
      organizationId, schemaVersion: v16, createdBy: 'owner', createdAt: new Date().toISOString(), keyId: keyring.activeKeyId,
      cipher: 'aes-256-gcm', tables: POINT1_RECOVERY_SCHEMA_V16.map((table) => ({
        name: table.name, columns: [...table.columns], rowCount: tables[table.name].length, sha256: sha256(tables[table.name]),
      })),
    }, { organizationId, schemaVersion: v16, tables }).payload;
    const insertedTemplates: string[] = [];
    const client = { query: async (sql: string) => {
      const normalized = sql.toLowerCase();
      if (normalized.includes('from recovery_artifacts')) return { rows: [{ id: 'artifact-legacy-templates' }] };
      if (normalized.includes('select document_templates from organization_profiles')) return { rows: [{ document_templates: null }] };
      if (normalized.includes('select id, current_version_id from document_templates')) return { rows: [] };
      if (normalized.includes('select id from document_template_assignments')) return { rows: [] };
      if (normalized.startsWith('insert into document_templates')) insertedTemplates.push(normalized);
      return { rows: [] };
    } };

    await new SqlRecoveryPromoter().promote({
      job: { id: 'job-legacy-templates', artifactId: 'artifact-legacy-templates', targetOrganizationId: organizationId } as any,
      payload: upgraded, actorUserId: 'owner', client: client as any,
    });
    expect(insertedTemplates.length).toBeGreaterThanOrEqual(42);
  });

  it('round-trips exact issued PDF bytes through base64 JSON and rejects hash or length mismatch', () => {
    const bytes = Buffer.from([0, 255, 37, 80, 68, 70, 13, 10, 0, 128, 1]);
    const row: Record<string, any> = Object.fromEntries(
      POINT1_RECOVERY_SCHEMA.find((table) => table.name === 'document_render_snapshots')!.columns.map((column) => [column, null]),
    );
    Object.assign(row, {
      id: 'snapshot-issued',
      organization_id: organizationId,
      category: 'invoices',
      document_id: 'invoice-1',
      source_data_hash: 'a'.repeat(64),
      render_model: { total: '100.00' },
      pdf_byte_size: bytes.length,
      artifact_state: 'ISSUED',
      issuance_number: 1,
      pdf_bytes: bytes,
      pdf_sha256: createHash('sha256').update(bytes).digest('hex'),
    });

    const normalizedMemoryRow = (new RecoveryArtifactService({} as any) as any).normalizeRow(
      POINT1_RECOVERY_SCHEMA.find((table) => table.name === 'document_render_snapshots')!,
      { ...row, pdf_bytes: bytes.toString('base64') },
      organizationId,
    );
    expect(decodeRecoveryPdfRow(normalizedMemoryRow).pdf_bytes).toEqual(bytes);

    const encoded = encodeRecoveryPdfRow(row);
    expect(typeof encoded.pdf_bytes).toBe('string');
    const decoded = decodeRecoveryPdfRow(JSON.parse(JSON.stringify(encoded)));
    expect(decoded.pdf_bytes).toEqual(bytes);

    expect(() => decodeRecoveryPdfRow({ ...encoded, pdf_byte_size: bytes.length + 1 })).toThrow(/byte length/);
    expect(() => decodeRecoveryPdfRow({ ...encoded, pdf_sha256: '0'.repeat(64) })).toThrow(/SHA-256/);
  });

  it('preserves metadata-only snapshots without inventing PDF bytes', () => {
    const row = {
      artifact_state: 'LEGACY_METADATA_ONLY',
      pdf_byte_size: 4096,
      pdf_bytes: null,
      pdf_sha256: null,
    };
    expect(encodeRecoveryPdfRow(row)).toEqual(row);
    expect(decodeRecoveryPdfRow(JSON.parse(JSON.stringify(row)))).toEqual(row);
  });
});
