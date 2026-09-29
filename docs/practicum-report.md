# RollGaud Practicum Report

## Abstract

RollGaud implements a single-host deployment controller around immutable CI artifacts, verified release provenance, fixed runtime templates, health probes, traffic switching, recovery, observability, and protected PostgreSQL backups. Local unit, integration, static configuration, and mocked release-flow tests are recorded in `docs/test-report.md`. A public deployment, GitHub/GHCR run, authorized host, public HTTPS endpoint, and capacity measurement were not available, so this report does not claim production readiness.

## 1. Scope and objectives

The implementation follows specification goals G1–G7 for one administrator, one stateless demonstration application, one Ubuntu host, and one PostgreSQL platform database. Multi-tenant hosting, multi-host failover, arbitrary Compose input, and database migration rollback remain outside scope. The visible product name is RollGaud; existing DevDeploy document filenames and historical task names are retained for traceability.

## 2. Implemented method

GitHub workflows lint, test, scan, build and emit a release manifest; the API verifies repository, workflow, branch, commit and immutable image digest before queueing a release. A worker claims one project attempt at a time, renders fixed Compose and Traefik files, probes the inactive slot, switches traffic atomically, verifies the public SHA, and records rollback or recovery failure. The dashboard uses typed contracts and same-origin authentication. Prometheus, Grafana, Loki and Alloy configuration is private by default. Backup scripts create checksummed dumps and configuration snapshots and restore only to an explicitly supplied isolated target.

## 3. Evidence and results

The complete G1–G7 matrix is in `docs/test-report.md`. The Task 17 harness runs healthy A→B, scanner rejection, unhealthy C preservation, post-switch restoration to B, manual rollback to A, ordered events, and isolated row-copy restore. Task 16's disposable PostgreSQL drill matched schema and project/deployment/event row counts. Sequential lint, typecheck, test, build, task checks, and static host/observability/workflow checks were run locally; exact output is recorded in `docs/progress.md`.

## 4. Security and operational evaluation

The API and web services have no Docker socket or route write access. Runtime secrets are supplied through protected environment/CI storage, not committed files or browser bundles. The pre-push audit reviewed all reachable local refs, working files, workflows, Dockerfiles, configuration, and build output with redacted reporting. The Gitleaks executable was unavailable in this environment, so publication remains blocked until a current history and directory scan is run. GitHub secret scanning/push protection, live Trivy/GHCR evidence, and host recovery are also pending.

## 5. Limitations and next evidence

No remote is configured and no server, DNS, TLS, registry, or deployment was changed. Public HTTPS probes, unhealthy-image recovery over HTTP 200, live rollback, Prometheus/Grafana/Loki correlation, alert firing, off-host backup replication, and 20-release/1-RPS capacity measurements are pending. The guarded measurement scripts refuse to run without explicit disposable-host authorization. No screenshots or resource numbers are fabricated.

## 6. Conclusion

Local implementation and acceptance harness work is complete through Task 17, but G1–G7 are not all proven in a live environment. The final practicum release and tag therefore remain pending until the external gates in `docs/test-report.md` are executed and reviewed.
