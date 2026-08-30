#!/bin/sh
set -eu
umask 077

: "${PGPASSWORD:?Set PGPASSWORD in the NAS backup Compose configuration}"

while true; do
  work=$(mktemp -d "/backups/.pending-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
  echo 'Starting consistent database export.'
  if pg_dump --no-password --format=custom --lock-wait-timeout=60s --file="$work/database.dump" &&
     pg_restore --file=/dev/null "$work/database.dump" &&
     (cd "$work" && sha256sum database.dump > SHA256SUMS); then
    name=${work##*/}
    final="/backups/firmbooks-${name#.pending-}"
    mv "$work" "$final"
    echo "BACKUP SUCCESS: $final (archive readable; restore drill still required)"
    sleep 86400
  else
    echo "BACKUP FAILED: incomplete files retained at $work; retrying in five minutes." >&2
    sleep 300
  fi
done
