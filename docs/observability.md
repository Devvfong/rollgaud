# Observability

**Status:** Configured locally in Task 15; live host evidence remains pending.

| Signal | Planned source | Location |
| --- | --- | --- |
| CPU, RAM, disk | Node Exporter | Prometheus/Grafana |
| Container metrics | Deliberately omitted cAdvisor; host and application metrics remain enabled | Prometheus/Grafana |
| Request rate, latency, 5xx | API and sample app metrics | Prometheus/Grafana |
| Application and worker logs | Docker journald + worker journal → Alloy | Loki/Grafana |
| Release state and events | Worker → PostgreSQL | DevDeploy dashboard |

Minimum alerts are configured for public application unavailability for 2 minutes, disk above 85% for 10 minutes, and `recovery_failed` immediately. Prometheus retention is 14 days and Loki retention is 7 days; deployment event history remains in PostgreSQL.

## Boundary decisions

- Alloy reads the host systemd journal from read-only journal mounts and sends entries to Loki with only `project`, `service`, and `environment` labels. It has no Docker socket, container runtime mount, request ID label, credential, or host-specific endpoint in Git.
- The sample `student-api` uses the journald logging driver and is reachable only on the private application/monitoring networks. Prometheus, Loki, Grafana, and Node Exporter have no published host ports; Traefik remains the only public listener.
- cAdvisor was reviewed against its [upstream Docker deployment requirements](https://github.com/google/cadvisor#running-cadvisor). Its normal deployment needs access to `/var/run`/the Docker runtime and `/var/lib/docker`, plus host filesystem access and (in the documented image example) privileged/device access; granting that access would cross the platform boundary that keeps the public API, Traefik, Alloy, and the web app away from Docker control. It is therefore not provisioned. Node Exporter uses read-only `/proc`, `/sys`, and host-root mounts for host disk/CPU/memory signals.
- Grafana is provisioned from committed, non-secret datasource and dashboard files. Its administrator password is required from runtime environment configuration and is never committed.

**Evidence pending:** healthy Prometheus targets, dashboard screenshots, example log query filtered by project/deployment, alert firing test, journal access review, and an authorized disposable-host request/error correlation. No host was started or changed for this task.
