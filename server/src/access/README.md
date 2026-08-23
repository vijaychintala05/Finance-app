# Point-1 Membership Lifecycle Integration Contract

This directory is intentionally self-contained. Main must supply the schema and mount the routers before the feature is enabled.

## Required schema

`organization_invitations` requires:

- `id VARCHAR(128) PRIMARY KEY`
- `organization_id VARCHAR(64) NOT NULL`
- `email VARCHAR(255) NOT NULL` stored lower-case
- `role VARCHAR(50) NOT NULL`
- `token_hash VARCHAR(64) NOT NULL UNIQUE`
- `expires_at TIMESTAMPTZ NOT NULL`
- `invited_by_user_id VARCHAR(64) NOT NULL`
- `accepted_at TIMESTAMPTZ NULL`
- `accepted_by_user_id VARCHAR(64) NULL`
- `revoked_at TIMESTAMPTZ NULL`
- `revoked_by_user_id VARCHAR(64) NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
- tenant-safe foreign keys for organization and user references
- a partial unique index on `(organization_id, email)` where acceptance and revocation are null
- indexes on `(organization_id, created_at DESC)` and `token_hash`

`organization_members` requires these additions:

- `status VARCHAR(20) NOT NULL DEFAULT 'Active'` constrained to `Active` or `Revoked`
- `access_version INTEGER NOT NULL DEFAULT 1`
- `access_invalidated_at TIMESTAMPTZ NULL`
- `revoked_at TIMESTAMPTZ NULL`
- `revoked_by_user_id VARCHAR(64) NULL`
- an index supporting active-owner counts on `(organization_id, role, status)`

The existing `audit_logs` and `revoked_tokens` tables are also required. Audit inserts and mutations occur in the same transaction. Stored token hashes are never selected by list operations or returned by the API.

## Mount requirements

Mount the management router after authentication, organization isolation, and idempotency middleware:

```ts
app.use(
  '/api/v1/access',
  authMiddleware,
  organizationIsolationMiddleware,
  idempotencyMiddleware,
  createMembershipManagementRouter(),
);
```

Mount acceptance separately because an invitee is not yet an organization member. The acceptance router applies authentication itself and must not run behind organization isolation:

```ts
app.use('/api/v1/access', createInvitationAcceptanceRouter());
```

Mount acceptance before the management router so its authentication-only contract remains explicit.

## Authorization and session invalidation

All management routes delegate the exact RBAC decision to `requirePermission('settings.manage_users')`. The service independently checks that the acting and target memberships are active and enforces last-owner protection under row locks.

Role changes and revocations increment `organization_members.access_version`, set `access_invalidated_at`, and insert a `revoked_tokens` row in the same transaction. The latter is a compatibility fail-closed mechanism for the current global-token auth implementation.

Main should evolve authentication to include or load the organization membership `access_version` on every request and reject sessions when:

- the membership is not `Active`;
- the session claim version differs from `access_version`; or
- the token issue time is not later than `access_invalidated_at`.

Once version-aware enforcement is deployed and certified, the global `revoked_tokens` compatibility write may be replaced with organization-scoped session invalidation.

The raw invitation token is returned once by issue endpoints for delivery by the future mail boundary. Only its SHA-256 hash is stored.
