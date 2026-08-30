# Initial NAS database backups

This is a separate Compose project. Do not replace or redeploy the running
FirmBooks project to install it. The app's current latest image policy can
otherwise unexpectedly update the app.

1. Confirm NAS Docker > Network includes `firmbooks_database`. This name is
   derived from the repository Compose configuration; it is not yet verified
   against the running NAS. If it differs, use the existing network shared by
   the FirmBooks app and database. Do not create a new empty network to bypass
   an external-network-not-found error.
2. Confirm the NAS folder `/ufi/pool-raw/syspool/firm books/database-backups`
   exists. It must be separate from `nas-data/postgres`.
   Wait for GitHub Actions > Publish FirmBooks backup container to succeed.
   The script is packaged in `ghcr.io/vijaychintala05/finance-app:backup-latest`;
   no script upload or NAS image build is needed. This tag is separate from the
   application image's `latest` tag and uses the same existing public package.
3. Create a new Compose project named `firmbooks-backups`, with a new directory
   such as `/ufi/pool-raw/syspool/Compose/firmbooks-backups`.
4. Use `compose.backups.manual.yaml` as its configuration. Replace only the
   password placeholder locally with the current database password. Never
   share that value, the container environment screen, or populated Compose
   contents. If the password contains `$`, Compose requires escaping it as
   `$$`; preserve YAML quoting. The exposed database password still needs
   coordinated rotation in PostgreSQL, the app connection, and this service.
5. Apply/start only this new project. Look for `BACKUP SUCCESS` in its logs.
   A running container alone is not evidence of a successful backup.
   The script is inside the image because the NAS Compose parser rejected inline
   shell variable expressions. Remove any old backup script bind mount when
   replacing the old backup configuration. Do not put script contents or
   passwords in the entrypoint field.
6. In File Manager, find a completed `firmbooks-...` folder containing
   `database.dump` and `SHA256SUMS`. Hidden `.pending-...` folders are incomplete
   and must not be used as successful backups.
7. Download completed folders to a private, access-restricted folder on the PC.
   This is initially a manual copy. Automatic PC copying is not configured.
   Do not put database dumps in Git, chat attachments, or publicly shared folders.

An export runs immediately, then 24 hours after each successful run. Restarting
the service triggers a new export. Failures retry after five minutes. The service
does not delete old backups or incomplete files: monitor NAS free space and
establish reviewed retention before leaving this unattended long term.

The job uses PostgreSQL 16 pg_dump for a consistent single-database archive.
pg_restore reads the full archive to check readability without connecting to a
database. This is NOT an actual restore test and does not prove application-level
recovery. Restore into a separate disposable PostgreSQL instance and verify
records/reports before relying on it. Never restore over the live database.

These archives are compressed, not encrypted. They contain sensitive financial
and account data. Restrict backup folder permissions. Keep an encrypted off-device
copy and preserve required application encryption keys separately in secure
storage. pg_dump does not include cluster roles, NAS settings, application
configuration, or files outside PostgreSQL.

Pending: first successful NAS run, coordinated credential rotation, PC copy,
encryption/retention policy, isolated restore drill, and previously reported
authentication fixes. No real-data readiness certification is implied.

## Publishing

The dedicated workflow runs on relevant pushes to nas-deploy or main, or by
manual dispatch. It publishes backup-latest and a backup-COMMIT_SHA tag. It never
publishes the app's latest tag. After validating a release, pin the NAS backup
image to its backup-COMMIT_SHA tag to avoid unexpected changes on redeploy.
