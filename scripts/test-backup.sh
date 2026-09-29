#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
fake_bin="$tmp_dir/bin"
backup_root="$tmp_dir/backups"
mkdir -p "$fake_bin" "$backup_root"

fail() { echo "backup test failed: $*" >&2; exit 1; }

cat >"$fake_bin/pg_dump" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
output=''
for argument in "$@"; do
  case "$argument" in --file=*) output=${argument#--file=} ;; esac
done
[[ -n "$output" ]] || exit 2
[[ "${FAKE_DUMP_FAIL:-0}" == 1 ]] && exit 1
printf 'synthetic dump rows=2\n' >"$output"
STUB
cat >"$fake_bin/psql" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_PSQL_NONEMPTY:-0}" == 1 ]]; then printf '1\n'; else printf '0\n'; fi
STUB
cat >"$fake_bin/pg_restore" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
[[ -n "${FAKE_RESTORE_MARKER:-}" ]] && printf 'restored\n' >"$FAKE_RESTORE_MARKER"
STUB
chmod 700 "$fake_bin"/*

export PATH="$fake_bin:$PATH"
export PGHOST=127.0.0.1 PGPORT=54329 PGUSER=devdeploy PGDATABASE=devdeploy PGPASSWORD=synthetic-only-runtime-value
export BACKUP_ROOT="$backup_root" PROJECT_ROOT="$root_dir"

"$root_dir/scripts/backup-platform.sh"
backup_path=$(cat "$backup_root/ACTIVE")
[[ -d "$backup_path" ]] || fail 'active backup was not created'
"$root_dir/scripts/verify-backup.sh" "$backup_path"
[[ "$(stat -c '%a' "$backup_path")" == 700 ]] || fail 'backup directory is not owner-only'
[[ "$(stat -c '%a' "$backup_path/database.dump")" == 600 ]] || fail 'database dump is not owner-only'
tar -tzf "$backup_path/config.tar.gz" | grep -qx 'infrastructure/compose/compose.platform.yml' || fail 'Compose config missing from snapshot'
tar -tzf "$backup_path/config.tar.gz" | grep -qx 'infrastructure/traefik/static.yml' || fail 'Traefik config missing from snapshot'

if "$root_dir/scripts/restore-platform.sh" --backup "$backup_path" --target '' --isolated; then fail 'empty target was accepted'; fi
if "$root_dir/scripts/restore-platform.sh" --backup "$backup_path" --target 'postgresql://devdeploy@127.0.0.1:54329/isolated?unsafe=1' --isolated; then fail 'unsafe target was accepted'; fi
if CURRENT_DATABASE_URL='postgresql://devdeploy@127.0.0.1:54329/current_db' "$root_dir/scripts/restore-platform.sh" --backup "$backup_path" --target 'postgresql://devdeploy@127.0.0.1:54329/current_db' --live; then fail 'live restore without confirmation was accepted'; fi

export FAKE_RESTORE_MARKER="$tmp_dir/restored.marker"
"$root_dir/scripts/restore-platform.sh" --backup "$backup_path" --target 'postgresql://devdeploy@127.0.0.1:54329/isolated_db' --isolated
[[ -f "$FAKE_RESTORE_MARKER" ]] || fail 'isolated restore did not run'

chmod 644 "$backup_path/database.dump"
if "$root_dir/scripts/verify-backup.sh" "$backup_path"; then fail 'world-readable backup was accepted'; fi
chmod 600 "$backup_path/database.dump"

export FAKE_DUMP_FAIL=1
if "$root_dir/scripts/backup-platform.sh"; then fail 'failed dump was reported successful'; fi
unset FAKE_DUMP_FAIL
find "$backup_root/failed" -name metadata -print -quit | grep -q metadata || fail 'failed backup was not retained'

tampered="$backup_root/daily/tampered"
cp -a "$backup_path" "$tampered"
printf 'tampered\n' >>"$tampered/database.dump"
if "$root_dir/scripts/verify-backup.sh" "$tampered"; then fail 'checksum failure was not detected'; fi
"$root_dir/scripts/backup-platform.sh" --prune
[[ -d "$tampered" ]] || fail 'unverified backup was pruned'

for index in $(seq -w 1 9); do
  path="$backup_root/daily/20200101T0000${index}Z"
  mkdir -p "$path"
  printf 'status=verified\n' >"$path/metadata"
  chmod 700 "$path"; chmod 600 "$path/metadata"
done
printf '%s\n' "$backup_root/daily/20200101T00001Z" >"$backup_root/ACTIVE"
failed_old="$backup_root/daily/20190101T000000Z"
mkdir -p "$failed_old"; printf 'status=failed\n' >"$failed_old/metadata"; chmod 700 "$failed_old"; chmod 600 "$failed_old/metadata"
"$root_dir/scripts/backup-platform.sh" --prune
[[ -d "$backup_root/daily/20200101T00001Z" ]] || fail 'active backup was pruned'
[[ -d "$failed_old" ]] || fail 'failed backup was pruned'

echo 'backup tests passed'
