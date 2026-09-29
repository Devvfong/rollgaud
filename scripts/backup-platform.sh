#!/usr/bin/env bash
set -euo pipefail
umask 077

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=${PROJECT_ROOT:-$(cd "$script_dir/.." && pwd)}
backup_root=${BACKUP_ROOT:-/var/backups/devdeploy}

fail() {
  echo 'backup failed; inspect the protected operator log' >&2
  exit 1
}

prune_kind() {
  local directory=$1 limit=$2 active_path=${3:-} kept=0 name path status canonical
  [[ -d "$directory" ]] || return 0
  while IFS= read -r name; do
    path="$directory/$name"
    [[ -d "$path" ]] || continue
    status=$(awk -F= '$1 == "status" { print $2; exit }' "$path/metadata" 2>/dev/null || true)
    [[ "$status" == verified ]] || continue
    canonical=$(realpath "$path")
    if [[ -n "$active_path" && "$canonical" == "$active_path" ]]; then
      continue
    fi
    if (( kept < limit )); then
      kept=$((kept + 1))
    else
      rm -rf -- "$path"
    fi
  done < <(find "$directory" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort -r)
}

prune_backups() {
  mkdir -p "$backup_root/daily" "$backup_root/weekly" "$backup_root/failed"
  chmod 700 "$backup_root" "$backup_root/daily" "$backup_root/weekly" "$backup_root/failed"
  local active_path=''
  if [[ -f "$backup_root/ACTIVE" ]]; then
    active_path=$(realpath "$(cat "$backup_root/ACTIVE")" 2>/dev/null || true)
  fi
  prune_kind "$backup_root/daily" 7 "$active_path"
  prune_kind "$backup_root/weekly" 4 "$active_path"
}

if [[ "${1:-}" == --prune ]]; then
  prune_backups
  echo 'backup retention applied'
  exit 0
fi
[[ -z "${1:-}" ]] || { echo 'usage: backup-platform.sh [--prune]' >&2; exit 2; }

command -v pg_dump >/dev/null 2>&1 || fail
for variable in PGHOST PGPORT PGUSER PGDATABASE; do
  [[ -n "${!variable:-}" ]] || fail
done

mkdir -p "$backup_root/daily" "$backup_root/weekly" "$backup_root/failed"
chmod 700 "$backup_root" "$backup_root/daily" "$backup_root/weekly" "$backup_root/failed"
backup_id=${BACKUP_NOW:-$(date -u +%Y%m%dT%H%M%SZ)}
stage="$backup_root/.staging-$backup_id-$$"
final="$backup_root/daily/$backup_id"
failed="$backup_root/failed/$backup_id"
mkdir "$stage"
chmod 700 "$stage"
current_path="$stage"

on_error() {
  set +e
  if [[ -d "$current_path" ]]; then
    printf 'status=failed\ncreated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$current_path/metadata"
    chmod 600 "$current_path/metadata"
    mv -- "$current_path" "$failed"
    chmod 700 "$failed"
  fi
  echo 'backup failed; inspect the protected operator log' >&2
  exit 1
}
trap on_error ERR

printf 'status=creating\ncreated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$stage/metadata"
chmod 600 "$stage/metadata"
pg_dump --format=custom --no-owner --no-acl --file="$stage/database.dump"
chmod 600 "$stage/database.dump"
tar -czf "$stage/config.tar.gz" -C "$repo_root" \
  infrastructure/compose/compose.platform.yml \
  infrastructure/compose/project-template.yml \
  infrastructure/traefik/static.yml \
  infrastructure/traefik/dynamic
chmod 600 "$stage/config.tar.gz"
(cd "$stage" && sha256sum database.dump config.tar.gz >SHA256SUMS)
chmod 600 "$stage/SHA256SUMS"
sed -i "s/^status=.*/status=verified/; \$a verified_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$stage/metadata"
chmod 600 "$stage/metadata"
mv -- "$stage" "$final"
chmod 700 "$final"
current_path="$final"
"$script_dir/verify-backup.sh" "$final" >/dev/null

if [[ "${BACKUP_WEEKLY:-0}" == 1 || "$(date -u +%u)" == 7 ]]; then
  rm -rf -- "$backup_root/weekly/$backup_id"
  cp -a -- "$final" "$backup_root/weekly/$backup_id"
  chmod 700 "$backup_root/weekly/$backup_id"
  find "$backup_root/weekly/$backup_id" -type f -exec chmod 600 {} +
fi
printf '%s\n' "$final" >"$backup_root/ACTIVE"
chmod 600 "$backup_root/ACTIVE"
prune_backups
trap - ERR
echo "backup created: $backup_id"
