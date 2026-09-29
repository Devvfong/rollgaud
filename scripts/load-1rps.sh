#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ ${AUTHORIZED_DISPOSABLE_HOST:-0} != 1 ]]; then
  echo 'PENDING: sustained 1 RPS measurement requires an authorized disposable host' >&2
  exit 2
fi
origin=${CAPACITY_ORIGIN:-}
path=${LOAD_PATH:-/health}
curl_config=${CAPACITY_CURL_CONFIG:-}
duration=${LOAD_DURATION_SECONDS:-600}
[[ "$origin" =~ ^https?://[^/@?#[:space:]]+$ ]] || { echo 'invalid CAPACITY_ORIGIN' >&2; exit 2; }
[[ "$path" =~ ^/[A-Za-z0-9._~/-]*$ && "$path" != *..* ]] || { echo 'invalid LOAD_PATH' >&2; exit 2; }
[[ -r "$curl_config" ]] || { echo 'CAPACITY_CURL_CONFIG must be a readable protected curl config' >&2; exit 2; }
[[ "$duration" =~ ^[1-9][0-9]*$ ]] || { echo 'LOAD_DURATION_SECONDS must be a positive integer' >&2; exit 2; }
started=$(date +%s)
sent=0
errors=0
while (( $(date +%s) - started < duration )); do
  request_started=$(date +%s%N)
  if ! curl --config "$curl_config" --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' "$origin$path" | grep -Eq '^2[0-9][0-9]$'; then
    errors=$((errors + 1))
  fi
  sent=$((sent + 1))
  elapsed_ms=$((($(date +%s%N) - request_started) / 1000000))
  if (( elapsed_ms < 1000 )); then sleep "0.$(printf '%03d' $((1000 - elapsed_ms)))"; fi
done
echo "1 RPS observation complete: requests=$sent errors=$errors elapsed=$(( $(date +%s) - started ))s"
(( errors == 0 ))
