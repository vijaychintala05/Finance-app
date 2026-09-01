export type RecoveryErrorCode =
  | 'RECOVERY_ARTIFACT_NOT_FOUND'
  | 'RECOVERY_JOB_NOT_FOUND'
  | 'RECOVERY_INTEGRITY_FAILED'
  | 'RECOVERY_DECRYPTION_FAILED'
  | 'RECOVERY_MANIFEST_INVALID'
  | 'RECOVERY_TENANT_MISMATCH'
  | 'RECOVERY_SCHEMA_MISMATCH'
  | 'RECOVERY_VALIDATION_FAILED'
  | 'RECOVERY_OWNER_REQUIRED'
  | 'RECOVERY_RECENT_AUTH_REQUIRED'
  | 'RECOVERY_CONFIRMATION_MISMATCH'
  | 'RECOVERY_JOB_NOT_READY'
  | 'RECOVERY_ROLLBACK_UNAVAILABLE'
  | 'RECOVERY_CONFIGURATION_INVALID';

export class RecoveryError extends Error {
  constructor(
    public readonly code: RecoveryErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RecoveryError';
  }
}
