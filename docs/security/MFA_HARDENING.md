# MFA Hardening

## Authentication Contract

- MFA-enabled password login returns `mfaRequired` and a five-minute `mfaTicket`, never a session or authentication cookie before verification.
- `POST /api/v1/auth/mfa/verify` accepts `{ mfaTicket, mfaCode }`. The legacy `/api/v1/identity/mfa/challenge` route uses the same contract; bare user IDs and codes are no longer accepted.
- Challenge JWTs are rejected by normal bearer/cookie authentication and refresh. Normal access tokens cannot act as challenges.
- Used challenges, expired challenges and challenges issued before global token revocation are rejected.
- Verification is limited per account across tickets, IP addresses and verification routes. Five attempts are available within a 15-minute window; successful factor verification clears the counter. Lockout responds with HTTP 429 and Retry-After.
- Accepted TOTP time steps cannot be reused. Recovery codes are consumed with a row lock and transaction, including their audit event, to prevent concurrent reuse and lost updates.
- Enabled MFA cannot be replaced by calling enrollment again. Enrollment confirmation checks that the secret has not changed since verification.
- Google callback requires a verified Google email and returns a challenge, without a session or cookie, when local MFA is enabled. Browser callback UX has not been validated by this change.

## Operational Notes

No schema migration or new environment variables are required. TOTP secrets remain encrypted using AUTH_ENCRYPTION_KEY, which must be preserved separately for disaster recovery.

Replay protection uses hashed, unique security_events IDs. Do not purge MFA_LOGIN_TICKET_CONSUMED events while their tickets could still be valid (five minutes), or MFA_TOTP_CONSUMED events within the accepted clock window. Recovery-code consumption is recorded in the credential row itself.

If session creation fails after a proof was consumed, restart login with a fresh TOTP or unused recovery code. Proof consumption fails closed.

The earlier session/JWT revocation mismatch is outside this change and remains a release concern. This change does not rotate exposed credentials, configure HTTPS, certify the NAS, or deploy an image.

## Verification

- Full suite during implementation: 67 files, 606 tests passed.
- Final focused authentication suite after recovery-code locking changes: 5 files, 55 tests passed.
- TypeScript check passed.
- Production build passed.

Tests use disposable pg-mem databases. Concurrent recovery-code tests validate application behavior in that emulator; real PostgreSQL concurrency and deployed browser flows still need release verification. No NAS database was accessed or modified.
