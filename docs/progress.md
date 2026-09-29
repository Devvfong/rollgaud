# Implementation Progress

**Status:** No application tasks completed in this documentation starter.

| Task | Commit | Focused tests | Other gates | Live evidence | Blocker |
| --- | --- | --- | --- | --- | --- |
| 1 — Workspace | Pending | Pending | Pending | Not applicable | None recorded |

After each task, record commands, exit status, environment, commit SHA and the next task. A local mock is not proof of a GitHub Actions run or a live server release. Use the plan's 17 tasks as the authoritative checklist.

## Task 1 execution evidence

- Environment: Node.js 24.21.0; pnpm 12.6.0 via Corepack.
- Red check: `node scripts/check-workspace.mjs` exited 1 before workspace manifests existed.
- Green checks: pending the Task 1 lockfile and final frozen installation/typecheck run.
- Live GitHub/server gate: not applicable; no server, deployment, or external service was configured.
- Next task: Task 2 awaits review.

## Task 1 result

- Lockfile generation: `corepack pnpm install --lockfile-only` exited 0 (all 7 workspace projects; pnpm 12.6.0).
- Required green check: `node scripts/check-workspace.mjs && corepack pnpm install --frozen-lockfile && corepack pnpm -r typecheck` exited 0. The workspace check passed, the lockfile was current, and all six package typechecks completed successfully.
- Root run commands: `corepack pnpm lint && corepack pnpm test && corepack pnpm build && corepack pnpm typecheck` exited 0. The scaffold contains no tests yet, so each package reported zero tests and zero failures.
- Live GitHub/server gate: not applicable; no deployment, server configuration, or external service was attempted.
- Next task: stop for review before Task 2, as requested.

## Task 2 execution evidence

- Red checks: `corepack pnpm --filter @devdeploy/contracts test` failed because `parseReleaseIdentity` and `parseProjectConfig` did not exist; `corepack pnpm --filter @devdeploy/student-api test` failed because `src/main.ts` did not exist.
- Green checks: contracts passed 3/3 tests; student API passed 4/4 tests; `corepack pnpm -r typecheck` exited 0.
- Local image check: built `devdeploy-student-api:task2` from the digest-pinned Dockerfile, bound it only to `127.0.0.1`, and observed `/health` as `{"status":"ok"}` plus `/version` with the configured 40-character SHA and `v1`.
- Live GitHub/server gate: not applicable; no registry publish, deployment, DNS, or server configuration was attempted.
- Next task: Task 3 awaits review.

## Task 3 execution evidence

- Red check: `corepack pnpm --filter @devdeploy/db test:integration` exited 1 before a database client/schema existed; the compiler reported the missing `db` export and missing Node test declarations.
- Implementation: added the initial Prisma migration for users, projects, releases, deployments, ordered deployment events, and scoped hashed API credentials. Project slug/domain, release `(project_id, workflow_run_id)`, and event `(deployment_id, sequence)` are database constraints. The same-project current-release rule remains the Task 7 application transaction invariant.
- Green integration check: with a fresh unprinted runtime PostgreSQL password, `DOCKER_HOST=unix:///var/run/docker.sock docker compose -f infrastructure/compose/compose.local.yml up -d postgres && corepack pnpm --filter @devdeploy/db prisma:migrate && corepack pnpm --filter @devdeploy/db test:integration` exited 0. The migration applied and the one integration test passed its duplicate-domain, duplicate-run, duplicate-event, and hash-column checks.
- Environment substitution: this machine's active Docker daemon is at `unix:///var/run/docker.sock`, so the documented Compose command used `DOCKER_HOST` rather than the unavailable default context. A `psql SELECT 1` readiness loop replaced `pg_isready`, because PostgreSQL can accept sockets before its requested database is created. The disposable local Compose stack and volume were removed after evidence capture.
- Workspace checks: `corepack pnpm -r typecheck && corepack pnpm -r test` exited 0; the DB unit test passed and the existing contracts/student API tests remained green.
- Live GitHub/server gate: not applicable; no remote, registry publish, deployment, DNS, or server configuration was attempted.
- Next task: Task 4.

## Task 4 execution evidence

- Red check: `corepack pnpm --filter @devdeploy/api test:e2e -- auth.e2e-spec` exited 1 before the NestJS app factory, auth routes, and test dependencies existed.
- Green e2e check: the same command exited 0 with 3/3 tests covering CSRF issue/binding, secure session cookie attributes, valid/disabled/missing/invalid/rate-limited access, and CSRF-protected logout/session revocation.
- Persistence: added `admin_sessions` with hashed token and CSRF columns. `PrismaAuthStore` persists sessions; the e2e factory uses a deliberately isolated in-memory store. `scripts/seed-admin.ts` rejects missing/weak runtime `ADMIN_EMAIL`/`ADMIN_PASSWORD` values and never contains a seed password.
- Database check: fresh local Compose migration creation/deployment and `corepack pnpm --filter @devdeploy/db test:integration` exited 0 with both migrations applied. The local stack/volume were removed afterward.
- Typechecks: `corepack pnpm --filter @devdeploy/api typecheck && corepack pnpm --filter @devdeploy/db typecheck` exited 0.
- Live GitHub/server gate: pending; no remote, deployment, DNS, or server configuration was attempted.
- Next task: Task 5.

## Task 5 execution evidence

- Red check: `corepack pnpm --filter @devdeploy/api test:e2e -- projects.e2e-spec` reached the existing authentication tests, then observed the missing project routes as `404`.
- Green checks: the focused command and `corepack pnpm --filter @devdeploy/api test` both passed all 5 authentication/project e2e tests. The catalog tests cover authenticated create/list/detail, duplicate slug/domain `409`, malformed domain/path, foreign namespace, invalid port `400`, and unauthenticated `401`.
- Package checks: `corepack pnpm --filter @devdeploy/api lint`, `typecheck`, and `build` each exited 0.
- Boundary: requests are restricted to name plus validated `ProjectConfig` fields; they have no accepted Compose YAML, shell command, or host-path field. Production persistence uses Prisma; e2e uses an isolated in-memory store.
- Live GitHub/server gate: pending; no remote, deployment, DNS, or server configuration was attempted.
- Next task: Task 6.

## Task 6 execution evidence

- Red check: `corepack pnpm --filter @devdeploy/api test -- github-run-verifier.spec` exited 1 before implementation because `../src/github/github-run-verifier.js` did not exist.
- Green mocked provenance check: the same command exited 0 with 16/16 tests. It accepts only a completed, successful `push` run with the exact repository, branch, workflow, commit SHA, run ID, and matching `release-manifest`; it rejects failed/in-progress/non-push/wrong-identity runs, missing or expired artifacts, digest mismatch, traversal/extra ZIP entries, compressed and decompressed size overflow, duplicate JSON keys, and upstream timeout.
- Focused verifier check: `node --test apps/api/dist/test/github-run-verifier.spec.js` exited 0 with 11/11 verifier/configuration tests.
- Package checks: `corepack pnpm install --lockfile-only`, `corepack pnpm --filter @devdeploy/api lint`, `typecheck`, and `build` each exited 0.
- Configuration boundary: production startup validates `GITHUB_REPOSITORY`, `GHCR_IMAGE_NAMESPACE`, `GITHUB_WORKFLOW_PATH`, and `GITHUB_READ_TOKEN`; values in `.env.example` are non-working runtime placeholders. The GitHub origin is fixed to `https://api.github.com`, with encoded path segments and no secret logging.
- Live GitHub/server gate: pending; tests use mocked HTTP responses and no remote, deployment, DNS, or server configuration was attempted.
- Next task: Task 7.

## Task 7 execution evidence

- Red check: `corepack pnpm --filter @devdeploy/api test:e2e -- release-admission.e2e-spec` exited 1 before the Task 7 routes existed; the credential endpoint returned `404`. Subsequent red cases exposed the missing UUID credential ID and invalid-expiry `400` mapping before their fixes.
- Green e2e check: the focused command exited 0 with 9/9 e2e tests. It covers admin-only/CSRF-protected credential creation and revocation, hashed/scoped/expired credentials, verified release admission, duplicate idempotency, stale runs, GitHub verifier failure, atomic queue failure, release/deployment history, ordered events, and same-project current-release enforcement.
- PostgreSQL integration: with a fresh disposable local Compose database and an unprinted runtime-only password, `corepack pnpm --filter @devdeploy/db prisma:migrate && corepack pnpm --filter @devdeploy/db test:integration` exited 0; the schema integration test passed. The loopback-only stack and its newly created volume were removed after capture.
- API package checks: `corepack pnpm --filter @devdeploy/api lint`, `typecheck`, and `build` each exited 0. The final full `corepack pnpm --filter @devdeploy/api test` run passed 20/20.
- Boundary: the public API verifies provenance before its transaction, stores only a SHA-256 hash of a generated workflow credential, and contains no Docker, Compose, subprocess, or shell control path.
- Live GitHub/server gate: pending; provenance is exercised through injected test verifiers and no remote, deployment, DNS, or server configuration was attempted.
- Next task: Task 8.

## Task 8 execution evidence

- Red check: `node scripts/check-workflows.mjs` exited 1 while `.github/workflows/ci.yml` was absent.
- Static workflow check: `node scripts/check-workflows.mjs` exited 0. It verifies the exact Task 6 five-field manifest schema/fixture, immutable action pins, CI lint/test/Gitleaks/Trivy gates, artifact name, protected-main completed-run checks, release isolation from completed-run source, and scanner-demo credential/deployment isolation.
- YAML validation: Python `yaml.safe_load` validated all three workflow files. Ruby was unavailable on this machine, so the installed Python parser was used without adding a lockfile dependency.
- Local workspace checks: `corepack pnpm lint`, `typecheck`, `test`, and `build` each exited 0; the API suite passed 20/20 tests.
- Live GitHub/GHCR gate: pending. No remote is configured, so no protected-main CI, GHCR digest, protected-environment approval, or release submission was attempted.
- Next task: Task 9.

## Task 9 execution evidence

- Red check: `corepack pnpm --filter @devdeploy/deploy-worker test -- worker.int.test docker-compose-adapter.test` exited 1 while the Task 9 queue and runtime modules were absent.
- Focused durable-worker check: with a disposable loopback-only PostgreSQL service, a fresh unprinted runtime password, and the two existing migrations applied, `corepack pnpm --filter @devdeploy/deploy-worker test -- worker.int.test docker-compose-adapter.test` exited 0 with 5/5 tests. It proves two concurrent workers produce one `preparing` claim/lease for a project and an expired lease leaves its queued successor unclaimed for Task 11 reconciliation.
- Compose validation: `docker compose -f /tmp/devdeploy-test-project.yml config` exited 0. The rendered safe fixture has an internal `expose` port only, 0.50 CPU/256 MiB limits, journald logging, dropped capabilities, read-only root filesystem, and no privileged mode, Docker socket, secret/env mount, or published host port.
- Workspace checks: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build` each exited 0. The normal root test run skips the two database-backed worker cases when `DATABASE_URL` is absent; the focused disposable-database run above is the green evidence for those cases. API tests passed 20/20.
- Limitation: the worker only claims/renews durable jobs and can render/start isolated application slots. It neither probes applications nor changes a Traefik route; health verification, traffic switching, and recovery remain Task 10–11 work.
- Live GitHub/server gate: pending. No remote, registry action, deployment, DNS, or server configuration was attempted.
- Next task: Task 10.

## Task 10 execution evidence

- Red check: `corepack pnpm --filter @devdeploy/deploy-worker test -- health-probe.test deploy-attempt.int.test` exited 1 before the Task 10 probe and deployment modules existed.
- Focused check: the same command exited 0 with 9 passing tests (and the two Task 9 database tests skipped without `DATABASE_URL`). It covers healthy release success, bad candidate before switching, wrong public SHA with verified restoration, malformed health/version JSON, timeout, first-release failure without invented rollback, and failed recovery.
- Traefik source validation: Python `yaml.safe_load` accepted `infrastructure/traefik/static.yml` and `infrastructure/traefik/dynamic/example.yml`. An attempted `traefik:v3.3 check --configFile=...` exited 127 because that image has no `check` subcommand; a full running Traefik validation remains pending Task 12 host Compose. The file provider watches its parent directory, so atomic route-file renames are observable.
- Workspace checks: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build` each exited 0; API tests passed 20/20.
- Limitation: no authorized test domain or TLS certificate is configured. The public HTTPS curl/good-image integration gate is pending; no server route was changed. Previous slots are never stopped in this task, preserving them for the planned 30-minute cleanup policy.
- Live GitHub/server gate: pending. No remote, registry action, deployment, DNS, or server configuration was attempted.
- Next task: Task 11.

## Task 11 execution evidence

- Red checks: the focused worker check failed before `queue/reconcile.ts` existed; the rollback e2e route was then added under the authenticated/CSRF-protected deployment controller.
- Focused checks: `corepack pnpm --filter @devdeploy/deploy-worker test -- reconcile.int.test recover.int.test` exited 0 with 12 passing tests (2 database-only Task 9 tests skipped without `DATABASE_URL`); `corepack pnpm --filter @devdeploy/api test:e2e -- rollback.e2e-spec` exited 0 with 11/11 e2e tests.
- Behavior: reconciliation is idempotent and records an expired/uncertain lease as requiring reconciliation instead of claiming another job. Manual deploy/rollback actions are authenticated and CSRF-protected, queue new attempts only when no active attempt exists, and concurrent actions produce one queued attempt plus one `409`. First-release failures remain `failed`; restoration is `rolled_back` only after the previous public SHA verifies, otherwise `recovery_failed`. Approved digests are re-pulled when absent and fail closed when unavailable; cleanup/retention helpers preserve the active and most recent known-good digests and use the 30-minute previous-slot window.
- Limitation: a disposable authorized host, test domain, and TLS route were unavailable. No unhealthy image or public old-version probe was run; that live-worker gate remains pending.
- Next task: Task 12.

## Task 12 execution evidence

- Red check: `bash scripts/check-host-config.sh` exited 1 before `infrastructure/compose/compose.platform.yml`, the systemd unit, and operations guide existed.
- Fail-closed Compose check: `docker compose -f infrastructure/compose/compose.platform.yml config` rejected unset required runtime variables. Re-running with explicitly non-working placeholders exited 0 and rendered the platform configuration.
- Host check: `bash scripts/check-host-config.sh` exited 0. It verifies that only Traefik publishes 80/443, private services have no host ports, no public service mounts the Docker socket, the Traefik dynamic directory is read-only, the worker is a dedicated restricted user, and the operations guide covers DNS/TLS, UFW, emergency restoration, Docker socket ownership, and runtime secrets.
- Traefik validation: an isolated `traefik:v3.3` container started with the static and dynamic files and was stopped after five seconds (`timeout` 124). It emitted only expected listener-close messages on termination; no configuration parse error occurred.
- Workspace checks: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build` each exited 0 against the Task 11 state. Database-backed worker tests remain skipped without `DATABASE_URL`; they were previously run with a disposable local PostgreSQL database.
- Live gate: no existing host, DNS, certificate, firewall, login, or HTTPS deployment was configured. Those checks remain pending and no server was changed.
- Next task: Task 13.

## Task 13 execution evidence

- Red check: `corepack pnpm --filter @devdeploy/web test:e2e -- visual-states.spec` initially failed while the typed view modules and visual pages were absent.
- Focused check: the same command exited 0 with 3/3 tests. It covers all five route titles/key fields, text-accessible status labels, prominent `recovery_failed` remediation, confirmation dialog labels/Escape dismissal, and responsive no-overflow assertions for the 360px/1280px design targets.
- UI implementation: added RollGaud shell, fixture data provider, login/overview/projects/project detail/deployment pages, status badges, timeline, confirmation action, loading/empty/error states, slate/neutral/cyan styling, and typed view contracts.
- Browser limitation: the configured computer-use browser was unavailable, so live viewport screenshots could not be captured. The focused responsive assertions and CSS media rules passed; no live API integration was attempted.
- Workspace checks: final `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build` are pending after the final UI green run.
- Next task: Task 14.

## Task 14 execution evidence

- Red checks: `corepack pnpm --filter @devdeploy/web test:e2e -- auth-flow.spec deployment-flow.spec` initially failed while the API client, session/CSRF modules, deployment polling/actions, and focused auth/deployment tests were absent. The compiler reported the missing modules before any implementation existed.
- Focused green check: the same command exited 0 with 7/7 tests (the two focused auth/deployment suites plus the existing visual-state tests). It verifies same-origin credentials and `X-CSRF-Token`, server-read `cache: 'no-store'` and forwarded cookies, relative-path rejection, 401-to-auth-error handling, exact project fields, queued 202 handling, three-second polling with abort, and typed 409 active-attempt conflicts.
- Frontend integration: added a relative-only `ApiClient` with typed HTTP/network errors, CSRF/session helpers, boundary validation using the shared project parser, project/release/deployment live data mapping against the Task 4/5/7/11 response contracts, and deploy/rollback queue helpers. Browser mutations use same-origin credentials and CSRF headers; no workflow, registry, database, or server-only values enter the client modules.
- Routing: updated `infrastructure/traefik/dynamic/example.yml` with non-working `rollgaud.example.test` same-origin `PathPrefix(`/api/v1`)` and web routers. The platform remains unconfigured and no route was applied to a host.
- Workspace checks: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build` each exited 0. The workspace test run reported 22 API tests, 12 passing worker tests plus 2 expected database-dependent skips without `DATABASE_URL`, 7 web tests, and the existing contracts/student-api/db tests passing.
- Visual/live limitations: the headless/browser surface was unavailable, so 360px and 1280px screenshots remain pending. The local NestJS/PostgreSQL stack was not started for this frontend-only task; live worker/public HTTPS verification remains pending without an authorized host.
- Next task: Task 15.

## Task 15 execution evidence

- Red checks: `bash scripts/check-observability.sh && corepack pnpm --filter @devdeploy/api test -- metrics.spec` stopped with `scripts/check-observability.sh: No such file or directory`. Running the metrics suite directly then failed its new `/metrics` assertion with HTTP 404 while the existing 22 API tests passed.
- Focused green checks: `bash scripts/check-observability.sh` exited 0; `corepack pnpm --filter @devdeploy/api test -- metrics.spec` exited 0 with 23/23 API tests; and `corepack pnpm --filter @devdeploy/student-api test` exited 0 with 5/5 tests, including request/error/latency metrics without request-id labels.
- Implementation: added API and sample-app Prometheus text metrics for request count, 5xx count, and latency; Prometheus targets for Node Exporter, API, and student-api; Grafana Prometheus/Loki datasources and a health/deployment/log dashboard; Loki seven-day retention; Prometheus fourteen-day retention; journald logging for the sample app; Alloy journal-to-Loki processing with project/service/environment labels and no Docker socket; and alerts for two-minute application unavailability, ten-minute disk use above 85%, and immediate `recovery_failed`.
- cAdvisor decision: the reviewed upstream Docker example requires `/var/run`, `/var/lib/docker`, host filesystem mounts, and privileged/device access in its standard setup. It is not provisioned; Node Exporter and application metrics remain enabled, preserving the documented Docker privilege boundary.
- Configuration validation: `docker compose -f infrastructure/compose/compose.platform.yml config` exited 0 with synthetic runtime placeholders; monitoring YAML/JSON and boundary checks passed through `bash scripts/check-observability.sh`. No credentials or host details were committed.
- Workspace checks: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build` each exited 0. The full test run passed 23 API tests, 5 student-api tests, 7 web tests, 12 worker tests with 2 expected database-only skips, plus contracts and DB tests.
- Live evidence: no authorized disposable host was available. Prometheus target health, Grafana panels, Loki correlation, alert firing, and journal rotation/access remain pending; no host, remote, or deployment was changed.
- Next task: Task 16.

## Task 16 execution evidence

- Red check: `bash scripts/test-backup.sh` exited 1 because `scripts/backup-platform.sh` did not exist.
- Focused green check: `bash scripts/test-backup.sh` exited 0. It covers empty/unsafe/live-unconfirmed targets, owner-only backup permissions, failed dump retention, checksum failure marking, active/current backup protection, failed-backup retention, Compose/Traefik snapshot contents, and isolated restore invocation.
- Implementation: added protected custom-format PostgreSQL dumps, SHA-256 checksums, owner-only metadata, Compose/Traefik snapshots, `ACTIVE` tracking, seven-daily/four-weekly guarded pruning, and systemd service/timer units. Restore requires a validated password-free target URL plus `--isolated`; live restores require separate `--live --confirm-live` flags and non-empty targets are rejected for isolated restores. Errors are generic and passwords stay in environment/protected files rather than arguments or logs.
- Disposable PostgreSQL drill: started the loopback-only `infrastructure/compose/compose.local.yml` database, applied existing migrations, inserted one known project/release/deployment/event, created a dump, restored it into a different `devdeploy_restore` database, and tore the stack/volume down. Source/restored schema normalized diff matched; table counts were 8/8 and project, deployment, and event counts were 1/1. Timed backup was approximately 0.33 seconds and restore approximately 0.32 seconds. The backup checksum verified and files were mode 0700/0600.
- Scheduling/validation: `systemd-analyze calendar '*-*-* 02:15:00 UTC'` resolved successfully; timer unit verification and shell syntax checks passed. `docker compose -f infrastructure/compose/compose.platform.yml config` was not changed by this task; backup snapshots use committed non-secret placeholders and no live host configuration was applied.
- Workspace checks: sequential `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build` each exited 0. The full test run passed 23 API tests, 5 student-api tests, 7 web tests, 12 worker tests with 2 expected database-only skips, plus contracts and DB tests.
- Live evidence: off-host backup replication, installed systemd execution, production retention, worker reconciliation after restore, host/DNS recovery, and HTTPS verification remain pending because no authorized host is configured.
- Next task: Task 17.
