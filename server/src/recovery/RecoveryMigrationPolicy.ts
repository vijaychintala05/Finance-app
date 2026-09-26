import { CURRENT_SCHEMA_VERSION } from '../database/migrationRunner';
import { RecoveryError } from './errors';
import type { RecoveryManifest, RecoveryPayload } from './types';

export type SchemaUpgradeTransformer = (payload: RecoveryPayload) => RecoveryPayload;

export class RecoveryMigrationPolicy {
  public static readonly CURRENT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
  public static readonly V13_SCHEMA_VERSION = '2026.09.12-v13-financial-command-evidence';
  public static readonly V15_SCHEMA_VERSION = '2026.09.24-v15-invoice-email-delivery-evidence';
  public static readonly V16_SCHEMA_VERSION = '2026.09.24-v16-payment-reversal-allocation-evidence';
  public static readonly SUPPORTED_SCHEMA_VERSIONS: readonly string[] = [
    CURRENT_SCHEMA_VERSION,
    RecoveryMigrationPolicy.V16_SCHEMA_VERSION,
    RecoveryMigrationPolicy.V15_SCHEMA_VERSION,
    RecoveryMigrationPolicy.V13_SCHEMA_VERSION,
  ];

  private static readonly transformers: Map<string, SchemaUpgradeTransformer> = new Map();

  public static registerUpgradeTransformer(fromVersion: string, transformer: SchemaUpgradeTransformer): void {
    this.transformers.set(fromVersion, transformer);
  }

  public static clearTransformers(): void {
    this.transformers.clear();
  }

  public static evaluateAndMigrate(
    manifest: RecoveryManifest,
    payload: RecoveryPayload
  ): { manifest: RecoveryManifest; payload: RecoveryPayload } {
    const version = manifest.schemaVersion;
    if (version === CURRENT_SCHEMA_VERSION) return { manifest, payload };

    if (version === this.V13_SCHEMA_VERSION) {
      return this.evaluateAndMigrate(
        { ...manifest, schemaVersion: this.V15_SCHEMA_VERSION },
        { ...payload, schemaVersion: this.V15_SCHEMA_VERSION }
      );
    }

    if (version === this.V15_SCHEMA_VERSION) {
      const v16Payload: RecoveryPayload = {
        ...payload,
        schemaVersion: this.V16_SCHEMA_VERSION,
        tables: {
          ...payload.tables,
          payments_received: (payload.tables.payments_received || []).map((row) => ({
            ...row,
            unallocated_amount_before_reversal: null,
          })),
        },
      };
      return this.upgradeV16ToV17(manifest, v16Payload);
    }
    if (version === this.V16_SCHEMA_VERSION) return this.upgradeV16ToV17(manifest, payload);

    const transformer = this.transformers.get(version);
    if (transformer) {
      const migratedPayload = transformer(payload);
      const migratedManifest: RecoveryManifest = {
        ...manifest,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };
      return { manifest: migratedManifest, payload: migratedPayload };
    }

    throw new RecoveryError(
      'RECOVERY_SCHEMA_INCOMPATIBLE',
      "Recovery artifact schema version '" + version + "' is incompatible with current engine '" + CURRENT_SCHEMA_VERSION + "'. Explicit schema upgrade required.",
      422,
      {
        artifactSchemaVersion: version,
        currentEngineVersion: CURRENT_SCHEMA_VERSION,
        supportedVersions: [...this.SUPPORTED_SCHEMA_VERSIONS],
      }
    );
  }

  private static upgradeV16ToV17(manifest: RecoveryManifest, payload: RecoveryPayload): { manifest: RecoveryManifest; payload: RecoveryPayload } {
    const migratedPayload: RecoveryPayload = {
      ...payload,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      tables: {
        ...payload.tables,
        organization_profiles: (payload.tables.organization_profiles || []).map((row) => ({
          ...row,
          branding: null,
          document_templates: null,
        })),
        invoices: (payload.tables.invoices || []).map((row) => ({
          ...row,
          edit_version: 1,
          line_items: null,
          customer_snapshot: null,
          is_gst_inclusive: null,
          terms: null,
          edit_history: null,
          salesperson_id: null,
          salesperson_name_snapshot: null,
          salesperson_code_snapshot: null,
          commission_rate_snapshot: null,
        })),
        document_templates: [],
        document_template_versions: [],
        document_template_assignments: [],
        document_render_snapshots: [],
      },
    };
    return {
      manifest: { ...manifest, schemaVersion: CURRENT_SCHEMA_VERSION },
      payload: migratedPayload,
    };
  }

  public static isSupported(version: string): boolean {
    return version === CURRENT_SCHEMA_VERSION || version === this.V16_SCHEMA_VERSION || version === this.V15_SCHEMA_VERSION
      || version === this.V13_SCHEMA_VERSION || this.transformers.has(version);
  }
}
