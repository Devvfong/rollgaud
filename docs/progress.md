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
