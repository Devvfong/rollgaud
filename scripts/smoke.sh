#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() { echo "smoke failed: $1" >&2; exit 1; }
origin=${SMOKE_ORIGIN:-}
project_id=${SMOKE_PROJECT_ID:-}
db_host=${SMOKE_DB_HOST:-}
db_port=${SMOKE_DB_PORT:-}
db_user=${SMOKE_DB_USER:-}
db_name=${SMOKE_DB_NAME:-}
db_password=${SMOKE_DB_PASSWORD:-${PGPASSWORD:-}}

[[ "$origin" =~ ^https?://[^/@?#[:space:]]+$ ]] || fail 'SMOKE_ORIGIN must be an http(s) origin without credentials or path'
[[ "$project_id" =~ ^[0-9a-fA-F-]{36}$ ]] || fail 'SMOKE_PROJECT_ID must be a UUID'
[[ -n "$db_host" && -n "$db_port" && -n "$db_user" && -n "$db_name" ]] || fail 'database connection variables are required'

tmp_dir=$(mktemp -d)
trap 'rm -rf -- "$tmp_dir"' EXIT
curl_bin=${CURL_BIN:-curl}
psql_bin=${PSQL_BIN:-psql}

"$curl_bin" --fail-with-body --silent --show-error --max-time 15 "$origin/health" >"$tmp_dir/health.json" || fail 'health probe did not return HTTP 2xx'
"$curl_bin" --fail-with-body --silent --show-error --max-time 15 "$origin/version" >"$tmp_dir/version.json" || fail 'version probe did not return HTTP 2xx'

python3 - "$tmp_dir/health.json" "$tmp_dir/version.json" <<'PY'
import json, sys
health = json.loads(open(sys.argv[1], encoding='utf-8').read())
version = json.loads(open(sys.argv[2], encoding='utf-8').read())
if health != {'status': 'ok'}:
    raise SystemExit('health response is not the required status object')
sha = version.get('commitSha')
if version.get('status') not in (None, 'ok') or not isinstance(sha, str) or len(sha) != 40 or any(c not in '0123456789abcdefABCDEF' for c in sha):
    raise SystemExit('version response does not contain a commit SHA')
print(sha.lower())
PY
version_sha=$(python3 - "$tmp_dir/version.json" <<'PY'
import json, sys
value = json.loads(open(sys.argv[1], encoding='utf-8').read()).get('commitSha')
print(value.lower() if isinstance(value, str) else '')
PY
)

db_sha=$(PGPASSWORD="$db_password" "$psql_bin" --no-align --tuples-only --quiet \
  --host="$db_host" --port="$db_port" --username="$db_user" --dbname="$db_name" \
  --command="SELECT lower(r.commit_sha) FROM projects p JOIN releases r ON r.id = p.current_release_id WHERE p.id = '$project_id'" \
  2>/dev/null | tr -d '[:space:]') || fail 'database current-release query failed'
[[ "$db_sha" =~ ^[0-9a-f]{40}$ ]] || fail 'database has no valid current release SHA'
[[ "$db_sha" == "$version_sha" ]] || fail 'public version SHA differs from database current release'
echo "smoke passed: current commit ${version_sha:0:12} verified"
