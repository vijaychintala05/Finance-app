import type { DbQueryClient } from '../database/db';

export const RECOVERY_FORMAT = 'firmbooks.point1-recovery' as const;
export const RECOVERY_FORMAT_VERSION = 1 as const;

export type RecoveryScalar = string | number | boolean | null;
export type RecoveryRow = Record<string, RecoveryScalar | object | RecoveryScalar[]>;

export interface RecoveryTableManifest {
  name: string;
  columns: string[];
  rowCount: number;
  sha256: string;
}

export interface RecoveryManifest {
  format: typeof RECOVERY_FORMAT;
  formatVersion: typeof RECOVERY_FORMAT_VERSION;
  artifactId: string;
  organizationId: string;
  schemaVersion: string;
  createdBy: string;
  createdAt: string;
  keyId: string;
  cipher: 'aes-256-gcm';
  tables: RecoveryTableManifest[];
}

export interface RecoveryPayload {
  organizationId: string;
  schemaVersion: string;
  tables: Record<string, RecoveryRow[]>;
}

export interface RecoveryEnvelope {
  manifest: RecoveryManifest;
  iv: string;
  authTag: string;
  ciphertext: string;
  hmac: string;
}

export interface StoredRecoveryArtifact {
  id: string;
  organizationId: string;
  status: 'READY' | 'STAGED' | 'PROMOTED';
  envelope: RecoveryEnvelope;
  createdBy: string;
  createdAt: string;
}

export interface RecoveryJob {
  id: string;
  artifactId: string;
  targetOrganizationId: string;
  stagingOrganizationId: string;
  status: 'STAGING' | 'VALIDATED' | 'PROMOTED' | 'FAILED';
  reconciliation: ReconciliationResult[];
  createdBy: string;
  createdAt: string;
  promotedBy?: string;
  promotedAt?: string;
}

export interface ReconciliationResult {
  name: string;
  passed: boolean;
  details?: Record<string, unknown>;
}

export interface RecoveryRepository {
  saveArtifact(artifact: StoredRecoveryArtifact, client: DbQueryClient): Promise<void>;
  getArtifact(artifactId: string): Promise<StoredRecoveryArtifact | null>;
  createJob(job: RecoveryJob, client: DbQueryClient): Promise<void>;
  getJob(jobId: string): Promise<RecoveryJob | null>;
  setJobValidated(jobId: string, results: ReconciliationResult[], client: DbQueryClient): Promise<void>;
  setJobFailed(jobId: string, reason: string): Promise<void>;
  setJobPromoted(jobId: string, promotedBy: string, promotedAt: string, client: DbQueryClient): Promise<void>;
  listArtifacts(organizationId: string): Promise<StoredRecoveryArtifact[]>;
  listJobs(organizationId: string): Promise<RecoveryJob[]>;
}

export interface RecoveryTransactionManager {
  transaction<T>(callback: (client: DbQueryClient) => Promise<T>): Promise<T>;
}

export interface RecoveryStager {
  stage(input: {
    job: RecoveryJob;
    payload: RecoveryPayload;
    client: DbQueryClient;
  }): Promise<void>;
}

export interface RecoveryReconciler {
  name: string;
  reconcile(input: {
    job: RecoveryJob;
    payload: RecoveryPayload;
    client: DbQueryClient;
  }): Promise<ReconciliationResult>;
}

export interface RecoveryPromoter {
  promote(input: {
    job: RecoveryJob;
    payload: RecoveryPayload;
    actorUserId: string;
    client: DbQueryClient;
  }): Promise<void>;
}

export interface OwnerAuthorizer {
  assertOwner(organizationId: string, userId: string, client: DbQueryClient): Promise<void>;
}

export interface RecoveryKeyring {
  activeKeyId: string;
  encryptionKeys: Record<string, Buffer>;
  hmacKeys: Record<string, Buffer>;
}
