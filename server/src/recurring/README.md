# Point-1 recurring transaction integration contract

`RecurringTransactionService` owns scheduling and occurrence lifecycle state. It does not create accounting documents directly. Callers inject canonical `INVOICE`, `BILL`, and `EXPENSE` creators; each callback receives the same `DbQueryClient` transaction used to mark the occurrence successful.

The callback must:

- use `occurrenceKey` as its idempotency key;
- create and post the document through the canonical domain engine;
- propagate the supplied transaction client through every write;
- return `{ documentId, documentType? }`;
- throw on any validation, posting, or audit failure.

Required profile columns:

`id`, `organization_id`, `name`, `kind`, `frequency`, `interval_count`, `start_date`, `end_date`, `next_run_date`, `anchor_day`, `timezone`, `catch_up_policy`, `max_catch_up`, `template` (`jsonb`), `auto_post`, `status`, `created_by`, `paused_at`, `version`, `created_at`, `updated_at`.

Required occurrence columns:

`id`, `organization_id`, `profile_id`, `occurrence_key`, `scheduled_for`, `kind`, `status`, `attempt_count`, `next_attempt_at`, `lease_owner`, `lease_expires_at`, `started_at`, `completed_at`, `quarantined_at`, `document_id`, `document_type`, `last_error_code`, `last_error_message`, `created_at`, `updated_at`.

Required constraints and indexes:

- unique `(organization_id, id)` on both tables;
- unique `(organization_id, occurrence_key)` on occurrences;
- composite occurrence-to-profile foreign key `(organization_id, profile_id)`;
- due-profile index on `(status, next_run_date, organization_id, id)`;
- claim index on `(status, next_attempt_at, scheduled_for, id)`;
- lease-recovery index on `(status, lease_expires_at)`.

`materializeDueOccurrences` and `claimDueOccurrences` use `FOR UPDATE SKIP LOCKED`. pg-mem can test validation, schedules, deterministic keys, and transaction callback behavior, but real PostgreSQL must certify that two workers never claim the same row, expired leases are reclaimed once, locked profiles are skipped, and index-backed claim plans remain bounded.

