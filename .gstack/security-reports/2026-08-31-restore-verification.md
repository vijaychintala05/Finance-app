# Local Backup Restore Verification

Date: 2026-08-31

Source: `D:\firm books -backup\database.dump` and `SHA256SUMS`.

## Verified Results

- Source SHA-256 matched the supplied checksum manifest.
- Successfully restored into an isolated, temporary PostgreSQL 16 database bound to localhost only.
- Restored as a non-superuser with single-transaction and exit-on-error enabled.
- All 90 archive table definitions matched the 90 restored public tables.
- Restored tables contained 57 rows in total.
- No unvalidated public constraints were found.
- One posted journal was checked; none had missing lines or an unbalanced debit/credit total.
- Temporary PostgreSQL server stopped successfully.
- Original backup checksum remained unchanged. Live NAS database was not modified.

## Limits

This verifies this database export, not a complete application recovery or security certification. Application encryption keys, configuration, external files and global database roles are not proven recoverable by this test. Accounting coverage is limited to the one posted journal present. A matching checksum detects change relative to the manifest, not authenticity of the original export.

Before real-data use, resolve the previously reproduced MFA challenge-token acceptance and incomplete session revocation issues, rotate exposed credentials, and verify protected remote access. Maintain a separate protected backup copy and repeat restore tests periodically.
