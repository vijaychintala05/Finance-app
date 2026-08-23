# Point-1 Recovery Integration Requirements

## Environment

- `RECOVERY_ACTIVE_KEY_ID`: identifier for the active key version.
- `RECOVERY_ENCRYPTION_KEY_BASE64`: exactly 32 random bytes, Base64 encoded.
- `RECOVERY_HMAC_KEY_BASE64`: a different 32 random bytes, Base64 encoded.
- Historical keys must remain available through the injected keyring until their artifacts expire.
- Keys must come from a secrets manager in production, never source control.

## Database

`recovery_artifacts` must contain: `id`, `organization_id`, `status`, `format_version`,
`schema_version`, `key_id`, `manifest JSONB`, `envelope JSONB`, `created_by`, and `created_at`.

`recovery_jobs` must contain: `id`, `artifact_id`, `target_organization_id`,
`staging_organization_id`, `status`, `reconciliation JSONB`, `failure_reason`, `created_by`,
`created_at`, `promoted_by`, and `promoted_at`.

Add indexes on artifact organization/creation time and job target organization/status. The
staging implementation must persist data in an organization namespace that normal tenant
queries cannot select. Stage cleanup must be asynchronous and auditable.

## Integration contracts

- Mount three authenticated owner routes: create artifact, stage artifact, and promote job.
- Supply a `RecoveryStager` that writes only to the generated staging organization namespace.
- Supply relational and accounting `RecoveryReconciler` callbacks. Accounting reconciliation
  must prove balanced journals and subledger-to-control-account agreement.
- Supply an `OwnerAuthorizer` that checks the current database owner inside promotion's transaction.
- Supply a `RecoveryPromoter` that atomically promotes a validated stage. It must not use
  `ON CONFLICT DO NOTHING`, partial commits, or production-first deletion. Prefer namespace
  pointer/version activation so the old production version remains available for rollback.
- Audit artifact creation, validation failure, successful validation, and promotion outside this
  module using immutable audit events and request IDs.
