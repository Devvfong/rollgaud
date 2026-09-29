#!/usr/bin/env bash
set -euo pipefail
umask 077

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
backup_path=''
target=''
isolated=0
live=0
confirm_live=0

usage() { echo 'usage: restore-platform.sh --backup PATH --target POSTGRESQL_URL --isolated [--live --confirm-live]' >&2; exit 2; }
while (($#)); do
  case "$1" in
    --backup) shift; backup_path=${1:-} ;;
    --target) shift; target=${1:-} ;;
    --isolated) isolated=1 ;;
    --live) live=1 ;;
    --confirm-live) confirm_live=1 ;;
    *) usage ;;
  esac
  shift
done

fail() { echo 'restore refused or failed; no platform target was changed' >&2; exit 1; }
[[ -n "$backup_path" && -n "$target" ]] || fail
[[ "$target" =~ ^postgres(ql)?://[A-Za-z0-9_.-]+@?[A-Za-z0-9_.-]+(:[0-9]{1,5})?/[A-Za-z0-9_][A-Za-z0-9_-]*$ ]] || fail
[[ "$target" != *'?'* && "$target" != *'#'* && "$target" != *';'* && "$target" != *'|'* && "$target" != *'&'* ]] || fail
if (( live == 0 )); then
  (( isolated == 1 )) || fail
else
  (( confirm_live == 1 )) || fail
fi
if [[ -n "${CURRENT_DATABASE_URL:-}" && "$target" == "$CURRENT_DATABASE_URL" && $live -eq 0 ]]; then fail; fi
if [[ -n "${PGHOST:-}" && -n "${PGPORT:-}" && -n "${PGUSER:-}" && -n "${PGDATABASE:-}" && "$target" == "postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}" && $live -eq 0 ]]; then fail; fi

"$script_dir/verify-backup.sh" "$backup_path" >/dev/null || fail
command -v psql >/dev/null 2>&1 || fail
command -v pg_restore >/dev/null 2>&1 || fail
export PGPASSWORD="${TARGET_PGPASSWORD:-${PGPASSWORD:-}}"
temporary_log=$(mktemp)
trap 'rm -f "$temporary_log"' EXIT
table_count=$(psql "$target" --tuples-only --no-align --command "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public'" 2>"$temporary_log" | tr -d '[:space:]') || fail
[[ "$table_count" == 0 || $live -eq 1 ]] || fail
if ! pg_restore --exit-on-error --no-owner --no-privileges --dbname="$target" "$backup_path/database.dump" >"$temporary_log" 2>&1; then
  fail
fi
echo 'restore completed; reconcile the worker and verify route state before serving traffic'
