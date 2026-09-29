#!/usr/bin/env bash
set -euo pipefail
umask 077

backup_path=${1:-}
fail() {
  if [[ -n "$backup_path" && -d "$backup_path" && -f "$backup_path/metadata" && "$backup_path" != */.staging-* ]]; then
    sed -i 's/^status=.*/status=failed/' "$backup_path/metadata" 2>/dev/null || true
    chmod 600 "$backup_path/metadata" 2>/dev/null || true
  fi
  echo 'backup verification failed' >&2
  exit 1
}
[[ -n "$backup_path" && -d "$backup_path" ]] || fail
[[ "$backup_path" != */.staging-* ]] || fail

mode=$(stat -c '%a' "$backup_path")
(( (8#$mode & 077) == 0 )) || fail
for file in metadata database.dump config.tar.gz SHA256SUMS; do
  [[ -f "$backup_path/$file" ]] || fail
  file_mode=$(stat -c '%a' "$backup_path/$file")
  (( (8#$file_mode & 077) == 0 )) || fail
done
[[ "$(awk -F= '$1 == "status" { print $2; exit }' "$backup_path/metadata")" == verified ]] || fail
(cd "$backup_path" && sha256sum -c SHA256SUMS >/dev/null) || fail
while IFS= read -r entry; do
  [[ "$entry" != /* && "$entry" != *../* && "$entry" != ../* ]] || fail
done < <(tar -tzf "$backup_path/config.tar.gz")
echo "backup verified: $(basename "$backup_path")"
