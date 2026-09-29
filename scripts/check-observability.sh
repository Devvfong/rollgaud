#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
monitoring_dir="$root_dir/infrastructure/monitoring"
compose_file="$root_dir/infrastructure/compose/compose.platform.yml"
observability_doc="$root_dir/docs/observability.md"

python3 - "$monitoring_dir" "$compose_file" "$observability_doc" <<'PY'
from pathlib import Path
import json
import sys
import yaml

monitoring, compose_path, doc_path = map(Path, sys.argv[1:])
repo_root = monitoring.parents[1]
required = [
    monitoring / 'prometheus.yml', monitoring / 'alerts.yml', monitoring / 'loki.yml', monitoring / 'alloy.alloy',
    monitoring / 'grafana' / 'provisioning' / 'datasources.yml', monitoring / 'grafana' / 'provisioning' / 'dashboards.yml',
    monitoring / 'grafana' / 'dashboards' / 'devdeploy.json', compose_path, doc_path,
]
for path in required:
    if not path.is_file():
        raise SystemExit(f'missing observability file: {path.relative_to(repo_root)}')

compose = yaml.safe_load(compose_path.read_text())
services = compose.get('services', {})
expected = {'traefik', 'api', 'web', 'postgres', 'prometheus', 'loki', 'alloy', 'node-exporter', 'student-api', 'grafana'}
if not expected.issubset(services):
    raise SystemExit(f'missing observability services: {sorted(expected - set(services))}')
if set(services['traefik'].get('ports', [])) != {'80:80', '443:443'}:
    raise SystemExit('only Traefik may publish 80/443')
for name, service in services.items():
    if name != 'traefik' and service.get('ports'):
        raise SystemExit(f'{name} must remain off public ports')
    if 'docker.sock' in repr(service) or '/var/run/docker' in repr(service):
        raise SystemExit(f'{name} must not mount the Docker socket')
if services['student-api'].get('logging', {}).get('driver') != 'journald':
    raise SystemExit('student-api must use journald logging')
prometheus = yaml.safe_load((monitoring / 'prometheus.yml').read_text())
jobs = {job['job_name']: job for job in prometheus.get('scrape_configs', [])}
for job in ('node-exporter', 'api', 'student-api'):
    if job not in jobs:
        raise SystemExit(f'Prometheus target missing: {job}')
if '/etc/prometheus/alerts.yml' not in (monitoring / 'prometheus.yml').read_text():
    raise SystemExit('Prometheus alert rules are not loaded')
alerts = yaml.safe_load((monitoring / 'alerts.yml').read_text())
alert_names = {rule['alert'] for group in alerts['groups'] for rule in group['rules']}
if alert_names != {'ApplicationUnavailable', 'DiskUsageHigh', 'RecoveryFailed'}:
    raise SystemExit('required alert set is incomplete')
dashboard = json.loads((monitoring / 'grafana' / 'dashboards' / 'devdeploy.json').read_text())
if len(dashboard.get('panels', [])) < 4:
    raise SystemExit('Grafana dashboard is missing health/deployment panels')
alloy = (monitoring / 'alloy.alloy').read_text()
if 'loki.source.journal' not in alloy or 'loki.write' not in alloy:
    raise SystemExit('Alloy journal source and Loki writer are required')
if 'project' not in alloy or 'service' not in alloy or 'environment' not in alloy:
    raise SystemExit('Alloy must attach project, service, and environment labels')
if 'request_id' in alloy.lower() or 'docker.sock' in alloy or '/var/run/docker' in alloy:
    raise SystemExit('Alloy contains a forbidden socket or high-cardinality request label')
loki = yaml.safe_load((monitoring / 'loki.yml').read_text())
if loki.get('limits_config', {}).get('retention_period') != '168h':
    raise SystemExit('Loki retention must be seven days')
doc = doc_path.read_text().lower()
for phrase in ('cadvisor', 'docker socket', 'journal', 'retention', 'recovery_failed'):
    if phrase not in doc:
        raise SystemExit(f'observability documentation missing {phrase}')
print('observability configuration checks passed')
PY
