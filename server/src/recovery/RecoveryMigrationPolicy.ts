import { CURRENT_SCHEMA_VERSION } from '../database/migrationRunner';
import { RecoveryError } from './errors';
import type { RecoveryManifest, RecoveryPayload } from './types';

export type SchemaUpgradeTransformer = (payload: RecoveryPayload) => RecoveryPayload;

export class RecoveryMigrationPolicy {
  public static readonly CURRENT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
  public static readonly SUPPORTED_SCHEMA_VERSIONS: readonly string[] = [
    CURRENT_SCHEMA_VERSION,
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

    if (version === CURRENT_SCHEMA_VERSION) {
      return { manifest, payload };
    }

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
      `Recovery artifact schema version '${version}' is incompatible with current engine '${CURRENT_SCHEMA_VERSION}'. Explicit schema upgrade required.`,
      422,
      {
        artifactSchemaVersion: version,
        currentEngineVersion: CURRENT_SCHEMA_VERSION,
        supportedVersions: [...this.SUPPORTED_SCHEMA_VERSIONS],
      }
    );
  }

  public static isSupported(version: string): boolean {
    return version === CURRENT_SCHEMA_VERSION || this.transformers.has(version);
  }
}
