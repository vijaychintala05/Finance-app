# NAS real-data readiness verification

Date: 2026-08-30
Decision: HOLD real financial data.
Status: DONE_WITH_CONCERNS for the focused source/live HTTP review; NAS administrative verification remains incomplete.
Source revision: dbd2418. The exact running NAS image revision has not been established.

## Scope and safety

Reviewed authentication/session handling, database readiness, deployment configuration, dependency advisories, and backup configuration evidence. Live requests were unauthenticated GET requests plus a small connection check against the user's NAS only. No accounts, financial records, secrets, or settings were changed on the NAS. Authentication reproductions used a disposable local pg-mem database with DATABASE_URL explicitly cleared. This is not a complete application penetration test or a full git-history secret audit.

## Release blockers

### 1. High: MFA challenge can authenticate protected requests

Confidence: 10/10. Verified in isolated local reproduction, not exploited on the NAS.

Source: server/src/controllers/authController.ts:166 issues a signed token with `purpose: 'mfa_login_challenge'`. server/src/middleware/organizationIsolation.middleware.ts:44-56 calls `JwtAuth.verifyToken(token)` and accepts `if (decoded)` without restricting purpose. The refresh handler at server/src/controllers/authController.ts:317 issues a normal token from that authenticated identity.

Attack scenario: someone with an account password obtains the MFA challenge ticket, presents it as a Bearer token to a protected endpoint, and receives access without providing the second factor. The same ticket can obtain a normal access token through refresh.

Observed local results: loginRequiresMfa=true; GET /api/v1/auth/me with the challenge ticket returned 200; POST /api/v1/auth/refresh returned 200 and issued an access token, without an OTP.

Required fix: reject all challenge-purpose tokens in normal authentication; constrain challenge lifetime and consumption; test that challenge tickets cannot read financial data, refresh, or enroll MFA. Keep MFA challenges separate from completed login sessions.

### 2. High: session revocation and logout do not invalidate all issued credentials

Confidence: 10/10. Verified in isolated local reproduction.

Source: server/src/auth/SessionService.ts:160 updates the database session status, while the JWT branch in server/src/middleware/organizationIsolation.middleware.ts:44-56 does not consult that session. Conversely, server/src/controllers/authController.ts:304-308 logs out by revoking JWTs and clearing the cookie without revoking the opaque database session. The change-password path at line 348 also only revokes JWTs; that variant was code-traced, not separately reproduced.

Attack scenario: a copied JWT remains usable after the owner revokes its associated device session. A copied opaque session token remains usable after logout. A revoked device can therefore retain access; the JWT can also be refreshed while valid.

Observed local results: revoked opaque token returned 401, but its paired JWT still returned 200. Separately, logout returned 200 and the opaque token issued by that login still accessed /api/v1/auth/me with status 200.

Required fix: unify login credentials under a server-validated session and revoke every credential belonging to the session. Test logout, revoke device, revoke other devices, password change, and password reset using the actual issued tokens.

### 3. High: plain HTTP entry point remains usable

Confidence: 9/10 for source behavior plus live HTTP reachability; no real-user login was submitted.

Live: http://192.168.1.9:55000/ returns FirmBooks HTML with status 200, with no redirect to HTTPS. This corrects earlier chat guidance that incorrectly identified that URL as the NAS management portal. Port 55000 is the app's default host mapping in compose.nas.ghcr.yaml.

Source: server/src/controllers/authController.ts:20-23 sets Secure only when inferred HTTPS is present. HTTP login is not rejected. The current browser source also stores the returned JWT in localStorage (src/context/AuthContext.tsx:28).

Attack scenario: when a user signs in through the LAN HTTP address, an attacker positioned on that network can intercept or alter the unencrypted exchange and steal credentials. A separate Tailscale HTTPS endpoint does not automatically disable this entry point. The exact remote URL and active Serve configuration are unverified.

Required fix: verify and use a canonical HTTPS app URL; restrict the backend listener/firewall to the intended proxy where feasible; enforce secure production sessions and trusted proxy handling. Test that password submission over plain HTTP is not accepted. Do not infer TLS protection from an HSTS header received over HTTP.

## Checks completed

- NAS /api/readyz: 200, status=ready, schemaCurrent=true, schemaVersion=2026.08.30-v5-identity-fortress. This is the app's readiness report, not a backup or storage-health test.
- Unauthenticated NAS requests to /api/v1/health, /auth/me, /identity/sessions, /security/backups and /finance/invoices returned 401 (paths after health are under /api/v1).
- GET /api/healthz with Origin https://untrusted.example.invalid returned 403.
- HTML includes CSP, anti-framing and no-sniff headers; API responses include no-store.
- Ports 22, 3000, 5432, 443, 2375 and 2376 did not connect from this PC during the two-second checks. Timeout does not prove firewall policy or lack of public forwarding. Port 55000 connected.
- npm audit --omit=dev reported zero known vulnerabilities for the local lockfile. NAS image packages and OS advisories were not scanned.
- Five focused security test files passed, 45 tests total. Their coverage does not catch the two reproduced authentication defects. Full E2E and real-PostgreSQL restore/concurrency testing were not run in this review.
- Repository Dockerfile uses USER node. The GHCR Compose template has an internal database network with no published PostgreSQL port, a read-only app filesystem, dropped app capabilities, and persistent database storage. Actual running container settings require separate confirmation.
- Local resolved Compose files are stale: they list the HTTP origin, TRUST_PROXY=false, and lack AUTH_ENCRYPTION_KEY. These are not reliable evidence of the current NAS environment and must not be blindly redeployed.

## Unverified controls required before real data

1. Exact running container image digest/commit and corrected authentication build.
2. Working canonical HTTPS FirmBooks URL tested on mobile data with Tailscale connected; private Serve rather than public Funnel.
3. Tailscale account MFA, authorized-device list, restrictive access rules, and revocation of the key previously posted in chat. Removing a key from Compose alone does not revoke it. Review device enrollment history for unauthorized devices.
4. NAS administrator MFA, firmware version, router forwarding/UPnP settings, and Docker access restrictions. Do not grant privileged container access just to enable Tailscale; the configured userspace mode does not require it.
5. NAS storage encryption, disk health and redundancy. None were established by application HTTP checks.
6. Scheduled PostgreSQL-consistent backups, an encrypted off-NAS copy, retention, last-success evidence and a successful restore into a separate disposable database. Preserve required application encryption keys separately and securely. Do not restore over the live database to test recovery.

No backup scheduler is present in the supplied GHCR Compose configuration. The NAS may have an independent backup job, which has not been inspected. The legacy application-backup route is not certified by trustedFeature.middleware.ts, and recovery-center needs deployment flags and encryption keys. Do not assume an application Backup button or RAID provides a recoverable off-device database backup.

## Deployment caution

.github/workflows/publish-container.yaml publishes the same latest tag from main, master and codex/** pushes, without a test job. compose.nas.ghcr.yaml pulls latest. Consequently, an ordinary development push can change what the NAS pulls on redeploy. Use a reviewed, tested immutable image digest/version and back up the database before migrations. The documented nas-deploy branch policy does not by itself control the current GHCR latest workflow.

## Next verification evidence

### Follow-up: Tailscale address supplied

The user supplied http://100.111.233.28:55000/. Read-only checks confirmed FirmBooks HTML returned 200, /api/readyz returned 200 with schemaCurrent=true, and /api/v1/auth/me returned 401 without authentication. This address matches the Tailscale node address previously shown in the user's logs.

Correction: HTTP over a Tailscale connection is encrypted between Tailscale peers by WireGuard; the lack of HTTPS does not imply plaintext transmission across the internet. See https://tailscale.com/docs/concepts/tailscale-encryption. Browser HTTPS and Secure-cookie support remain distinct protections. The LAN HTTP exposure noted above remains, and these HTTP probes do not inspect Tailscale ACLs, MFA, route configuration or router forwarding. Authentication defects and backup/recovery verification remain blockers. A browser HTTPS certificate has not been verified.

Provide the exact HTTPS URL used to open FirmBooks (no credentials), then redacted screenshots of the NAS backup schedule/last successful backup and Tailscale device/access settings. Never send passwords, auth keys, database exports, QR enrollment secrets, or recovery codes into chat.

This AI-assisted review is not a substitute for a professional security audit. It cannot guarantee security or certify production use; sensitive financial data warrants independent security review and a demonstrated recovery process.
