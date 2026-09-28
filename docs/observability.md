# Observability

**Status:** Planned. Fill dashboard links, scrape health and retention evidence after Task 15.

| Signal | Planned source | Location |
| --- | --- | --- |
| CPU, RAM, disk | Node Exporter | Prometheus/Grafana |
| Container metrics | cAdvisor if reviewed read-only mounts work | Prometheus/Grafana |
| Request rate, latency, 5xx | API and sample app metrics | Prometheus/Grafana |
| Application and worker logs | Docker journald + worker journal → Alloy | Loki/Grafana |
| Release state and events | Worker → PostgreSQL | DevDeploy dashboard |

Minimum alerts: public application unavailable for 2 minutes; disk above 85% for 10 minutes; `recovery_failed` immediately. No Docker socket for Alloy. Suggested retention: Prometheus 14 days, Loki 7 days, event history preserved in DB; measure disk use on the actual host and adjust.

**Evidence pending:** healthy Prometheus targets, dashboard screenshots, example log query filtered by project/deployment, alert test and journal access review.
