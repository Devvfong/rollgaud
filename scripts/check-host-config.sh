#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
compose_file="$root_dir/infrastructure/compose/compose.platform.yml"
unit_file="$root_dir/infrastructure/systemd/devdeploy-worker.service"
traefik_file="$root_dir/infrastructure/traefik/static.yml"
operations_file="$root_dir/docs/operations.md"

for required in "$compose_file" "$unit_file" "$traefik_file" "$operations_file"; do
  test -f "$required" || { echo "missing required host configuration: ${required#"$root_dir/"}" >&2; exit 1; }
done

python3 - "$compose_file" "$unit_file" "$traefik_file" "$operations_file" <<'PY'
from pathlib import Path
import sys
import yaml

compose_path, unit_path, traefik_path, operations_path = map(Path, sys.argv[1:])
compose = yaml.safe_load(compose_path.read_text())
if not isinstance(compose, dict) or not isinstance(compose.get('services'), dict):
    raise SystemExit('platform Compose must define services')
services = compose['services']
if set(services) - {'traefik', 'api', 'web', 'postgres', 'prometheus', 'loki', 'alloy'}:
    raise SystemExit('unexpected public host service')
if set(services['traefik'].get('ports', [])) != {'80:80', '443:443'}:
    raise SystemExit('only Traefik may publish exactly ports 80 and 443')
for name, service in services.items():
    if name != 'traefik' and service.get('ports'):
        raise SystemExit(f'{name} must not publish a host port')
    text = repr(service)
    if 'docker.sock' in text or '/var/run/docker' in text:
        raise SystemExit(f'{name} must not mount the Docker socket')
traefik_volumes = services['traefik'].get('volumes', [])
if not any(str(value).endswith(':/etc/traefik/dynamic:ro') for value in traefik_volumes):
    raise SystemExit('Traefik dynamic directory must be read-only')
if 'watch: true' not in traefik_path.read_text():
    raise SystemExit('Traefik file provider must watch the dynamic directory')
unit = unit_path.read_text()
for required in ('User=devdeploy-worker', 'Group=devdeploy-worker', 'NoNewPrivileges=true', 'ReadWritePaths=', 'Restart=on-failure'):
    if required not in unit:
        raise SystemExit(f'worker unit missing {required}')
operations = operations_path.read_text().lower()
for required in ('dns', 'tls', 'ufw', 'emergency', 'docker socket', 'runtime secret'):
    if required not in operations:
        raise SystemExit(f'operations guide missing {required}')
print('host configuration checks passed')
PY
