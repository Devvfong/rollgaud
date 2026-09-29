# RollGaud

**Status:** Local acceptance harness complete; live G1–G7 evidence remains pending.

RollGaud is a self-hosted controller for one Ubuntu host. GitHub Actions tests and scans a stateless demonstration application, publishes an immutable GHCR image, and submits a successful CI run. RollGaud verifies the run and image digest, starts a new slot, checks internal and public health, switches HTTPS traffic, and restores the last healthy version if verification fails.

## Start here

1. Read [`docs/devdeploy-practicum-specification.md`](docs/devdeploy-practicum-specification.md) for product scope and acceptance goals.
2. Read [`docs/superpowers/plans/2026-09-28-devdeploy-implementation.md`](docs/superpowers/plans/2026-09-28-devdeploy-implementation.md) for the 17 build tasks.
3. Agents read [`AGENTS.md`](AGENTS.md) and [`agent.md`](agent.md).
4. The implementation is locally testable, but this repository has no configured remote, GHCR registry, public DNS/TLS endpoint, or authorized production host.

## Planned stack

Node.js 24 LTS, pnpm, NestJS, Next.js, PostgreSQL/Prisma, Docker Compose, Traefik, GitHub Actions/GHCR, Gitleaks, Trivy, Prometheus, Grafana, Loki, and Alloy. The worker runs separately from the public API.

## Repository documentation

| File | Purpose |
| --- | --- |
| `docs/architecture.md` | Runtime boundaries and request/release flow |
| `docs/api.md` | API endpoint contracts and error model |
| `docs/ci.md` | GitHub workflow gates and release provenance |
| `docs/operations.md` | Installation, release checks, manual recovery |
| `docs/observability.md` | Metrics, logs, alerts and retention |
| `docs/backup-restore.md` | Backup schedule and isolated restore procedure |
| `docs/security.md` | Threats, controls and actual scan results |
| `docs/test-report.md` | G1–G7 evidence and actual results |
| `docs/practicum-report.md` | Final academic report structure |
| `docs/decisions.md` / `docs/progress.md` | Architecture changes and task evidence |

## Commands

Run local checks sequentially to limit RAM pressure:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
```

The acceptance harness is also available through `corepack pnpm test:e2e`. On an authorized disposable host, provide protected runtime variables and run `bash scripts/smoke.sh`; it probes `/health`, `/version`, and the database current release without printing credentials. `scripts/run-sequential-releases.sh` and `scripts/load-1rps.sh` refuse to run unless `AUTHORIZED_DISPOSABLE_HOST=1`; they have not been run here because no such host is authorized.

The final report in [`docs/test-report.md`](docs/test-report.md) is an evidence matrix, not a production-readiness claim. No release or tag is created until every G1–G7 live gate is independently proven.

## Scope

MVP: one administrator, one managed stateless demo app, one Ubuntu host, immutable images, verified rollout, rollback, history, metrics/logs, and backup/restore. Multi-tenant hosting, billing, Kubernetes, and multi-host failover are outside scope.
