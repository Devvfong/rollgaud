#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ ${AUTHORIZED_DISPOSABLE_HOST:-0} != 1 ]]; then
  echo 'PENDING: 20-release measurement requires an authorized disposable host' >&2
  exit 2
fi
origin=${CAPACITY_ORIGIN:-}
project_id=${CAPACITY_PROJECT_ID:-}
curl_config=${CAPACITY_CURL_CONFIG:-}
release_ids=${CAPACITY_RELEASE_IDS:-}
[[ "$origin" =~ ^https?://[^/@?#[:space:]]+$ ]] || { echo 'invalid CAPACITY_ORIGIN' >&2; exit 2; }
[[ "$project_id" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo 'invalid CAPACITY_PROJECT_ID' >&2; exit 2; }
[[ -r "$curl_config" ]] || { echo 'CAPACITY_CURL_CONFIG must be a readable protected curl config' >&2; exit 2; }
read -r -a ids <<<"$release_ids"
(( ${#ids[@]} == 20 )) || { echo 'CAPACITY_RELEASE_IDS must contain exactly 20 release IDs' >&2; exit 2; }
for id in "${ids[@]}"; do
  [[ "$id" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo 'release IDs must be UUIDs' >&2; exit 2; }
done
for index in "${!ids[@]}"; do
  started=$(date +%s%N)
  curl --config "$curl_config" --fail-with-body --silent --show-error --max-time 30 \
    -X POST "$origin/api/v1/projects/$project_id/deployments" \
    -H 'content-type: application/json' --data "{\"releaseId\":\"${ids[$index]}\"}" >/dev/null
  elapsed=$((($(date +%s%N) - started) / 1000000))
  echo "release $((index + 1))/20 queued in ${elapsed}ms"
done
