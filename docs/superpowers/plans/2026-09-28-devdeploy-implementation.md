# DevDeploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-host, self-hosted deployment controller that takes a CI-approved Docker image digest from GitHub, deploys a stateless demo app behind HTTPS, verifies the release, recovers on failure, and records history, metrics, and logs.

**Architecture:** GitHub Actions owns tests, scans, image publishing, and a successful-run release notification. A NestJS API validates GitHub provenance and stores state in PostgreSQL; a separate host-local TypeScript worker with Docker access runs fixed Compose templates and atomically updates Traefik file-provider routes. A Next.js dashboard displays state, while Prometheus/Grafana and Alloy/Loki provide metrics and logs.

**Tech Stack:** Node.js 24 LTS, TypeScript, pnpm workspaces, NestJS, Next.js, Prisma/PostgreSQL, Jest/Supertest (API), Vitest (worker/contracts), Docker Compose, Traefik, GitHub Actions/GHCR, Gitleaks, Trivy, Prometheus, Grafana, Loki, Alloy, systemd.

**Spec:** `docs/devdeploy-practicum-specification.md` (copy the approved `devdeploy-practicum-specification.md` into this path before executing Task 1; preserve its content).

## Global Constraints

- One developer, ten weeks, one Ubuntu host, one seeded administrator, one stateless `student-api` demonstration application.
- App contract: `GET /health` → `200 {"status":"ok"}`; `GET /version` → `200 {"commitSha":"<40-hex>","version":"v1"}` for the initial release.
- Only protected `main` can trigger release. Demo security branches run scans but have no deployment credentials.
- A CI run must be completed/successful, from the configured repo/branch/workflow, and have a matching release-manifest artifact before the API approves its immutable `ghcr.io/...@sha256:<64-hex>` image reference.
- Public API and web containers never mount Docker socket, host route directory for writing, or platform secrets.
- One deployment per project at a time. Previous route remains until new slot passes internal health; after switch, public `/health` and `/version.commitSha` must match before success.
- Old running slot stays for 30 minutes. Keep active and most recent known-good images locally; retain other successful images seven days if storage permits. Manual rollback may re-pull an older approved digest from GHCR.
- Platform database backups: seven daily/four weekly, with an isolated restore drill. The example application is stateless and has no data migration rollback.
- Serve Next.js and the NestJS API under one HTTPS origin (`/` for web, `/api/v1/*` for API). Browser requests use relative API URLs; server-rendered pages call the internal API with forwarded session cookie and `cache: 'no-store'`.
- Do not expose PostgreSQL, worker, Docker API, Prometheus, or Loki publicly. Pin actions and container dependencies before deployment. Never commit actual secrets.
- Public-repository rule: no hardcoded credentials, private host access details, database URLs with passwords, or secret fallbacks in code, docs, test fixtures, CI YAML, Dockerfiles, image layers, or browser bundles. Only synthetic values and non-working placeholders in `.env.example`; use runtime configuration validation and protected GitHub environment secrets. Follow `agent.md`'s pre-push history/working-tree scan gate before the first public push and every later push.
- Document deviations from the spec in `docs/decisions.md` before relying on them. Use one focused commit per completed task; never push or deploy without the user's authorization in the execution session.

## Review Focus

Five input/failure classes to explicitly test in the owning tasks:

1. Malformed or oversized CI release manifest (including ZIP traversal/ZIP bomb) → reject before parsing or recording approval (Task 6).
2. Duplicate and out-of-order CI runs → idempotent existing response or safe supersession; never replace a newer active release (Tasks 6–7).
3. Route file changed but public endpoint still serves the old version → do not mark success; restore/retain old route and record failure (Task 10).
4. Worker crash between external route change and DB commit → startup reconciliation derives real route/runtime and repairs status before taking another job (Task 11).
5. Registry image missing during manual rollback → keep current healthy route and record a failed attempt; do not erase history (Task 11).

## Execution protocol

Work in a new Git repository or isolated branch/worktree. The paths below are **new-repository targets**; if a repo already exists when execution starts, inspect it first and adapt paths without overwriting unrelated work. At each task, write the named failing test, run it red, implement only that contract, run focused tests green, run the package checks shown, inspect the diff for secrets, and commit. Record the commit, test output, and deviations in `docs/progress.md`. Real host changes, DNS, credentials, and protected GitHub settings require an authorized environment and should not be simulated as completed. Provide a local mock/test result if infrastructure is unavailable, then identify that gate as pending.

**Before any public push:** run the separate gate in `agent.md` over all Git history/refs, staged/working files, and built frontend assets. A clean current diff alone is insufficient because earlier local commits will also be published. Do not claim the repository is safe until that gate has actually passed; record only redacted evidence.

### Package map and file ownership

| Path | Responsibility |
| --- | --- |
| `apps/api/src/auth/`, `projects/`, `releases/`, `deployments/` | HTTP validation, administrator auth, GitHub admission, history; no Docker control |
| `apps/api/src/github/github-run-verifier.ts` | GitHub run/artifact verification behind a mockable interface |
| `apps/deploy-worker/src/queue/` | Claim/lease/serialize/reconcile project jobs |
| `apps/deploy-worker/src/runtime/` | Fixed Compose template, Docker command adapter, image/slot lifecycle |
| `apps/deploy-worker/src/routing/` | Validate/atomically swap Traefik file-provider routes |
| `apps/deploy-worker/src/probes/` | Internal/public health and commit verification |
| `apps/web/app/` | Admin dashboard and release/history views only |
| `apps/web/components/` | Shared shell, status badge, deployment timeline, confirmation dialog and reusable UI states |
| `apps/web/lib/` | Typed same-origin API client, auth/session helpers, polling control; no secret-bearing browser config |
| `apps/student-api/src/` | Stateless demonstration HTTP contract |
| `packages/contracts/src/` | Shared enums, DTO types, strict validators; no database or HTTP client |
| `packages/db/prisma/` | Platform schema/migrations and DB client |
| `infrastructure/` | Compose, Traefik, monitoring, Alloy, systemd templates |
| `.github/workflows/` | CI, scan, image publish, and completed-run release workflow |
| `scripts/` | Backup/restore/smoke scripts; fixed arguments, no arbitrary shell from API |

## Phase A — Working local foundation (Weeks 1–3)

### Task 1: Repository, toolchain, and run commands

**Files:** Create `package.json`, `pnpm-workspace.yaml`, `.node-version`, `.gitignore`, `.env.example`, `docs/devdeploy-practicum-specification.md`, `docs/decisions.md`, `docs/progress.md`, and package manifests under `apps/{api,web,deploy-worker,student-api}` and `packages/{contracts,db}`.

**Interfaces:** Define package names `@devdeploy/api`, `@devdeploy/web`, `@devdeploy/deploy-worker`, `@devdeploy/student-api`, `@devdeploy/contracts`, `@devdeploy/db`. Root scripts `lint`, `test`, `build`, `typecheck`; each package implements the relevant scripts. Node major `24`, pin exact pnpm version in `packageManager` and committed lockfile.

- [ ] **Step 1 — First failing check:** Add `scripts/check-workspace.mjs` asserting package names, four root scripts, existence of copied spec, `.env.example`, and absence of tracked `.env`.
- [ ] **Step 2 — Red:** Run `node scripts/check-workspace.mjs`; expect nonzero exit because manifests/packages are absent.
- [ ] **Step 3 — Implement:** Create the manifests, scripts, copied spec, minimal bootable package scaffolds and lockfile. Keep placeholders only in `.env.example`; no host credentials.
- [ ] **Step 4 — Green:** Run `node scripts/check-workspace.mjs && corepack pnpm install --frozen-lockfile && corepack pnpm -r typecheck`; expect exit 0. Capture chosen dependency versions in `docs/decisions.md`.
- [ ] **Step 5 — Commit:** `git add package.json pnpm-workspace.yaml pnpm-lock.yaml .node-version .gitignore .env.example apps packages scripts/check-workspace.mjs docs && git commit -m "chore: scaffold DevDeploy workspace"`.

### Task 2: Shared domain contracts and demonstration API

**Files:** Create `packages/contracts/src/{release.ts,deployment.ts,project.ts,index.ts}`, `packages/contracts/test/contracts.test.ts`, `apps/student-api/src/main.ts`, `apps/student-api/test/http.test.ts`, `apps/student-api/Dockerfile`.

**Interfaces:** Export `DeploymentStatus = 'queued'|'preparing'|'probing'|'switching'|'succeeded'|'failed'|'rolled_back'|'recovery_failed'|'cancelled'`, `ReleaseIdentity {repository, branch, commitSha, workflowRunId, imageDigest}`, `ProjectConfig {slug, repository, branch, imageNamespace, domain, port, healthPath}`, and pure `parseReleaseIdentity(input: unknown): ReleaseIdentity`, `parseProjectConfig(input: unknown): ProjectConfig`. Demo app reads build-time `COMMIT_SHA` and `APP_VERSION` and rejects missing/invalid SHA at startup.

- [ ] **Step 1 — Red:** Tests assert valid digest/40-hex SHA accepted, foreign registry/malformed SHA rejected, `/health` exactly `200 {status:'ok'}`, `/version` includes configured 40-hex SHA/version, and no filesystem persistence required.
- [ ] **Step 2 — Run:** `corepack pnpm --filter @devdeploy/contracts test && corepack pnpm --filter @devdeploy/student-api test`; expect failures before implementation.
- [ ] **Step 3 — Implement:** Validators and minimal stateless HTTP app; Dockerfile uses a non-root runtime and immutable build inputs.
- [ ] **Step 4 — Verify:** Re-run focused tests plus `corepack pnpm -r typecheck`; expect pass. Build sample image and check both endpoints locally without publishing ports beyond localhost.
- [ ] **Step 5 — Commit:** `git add packages/contracts apps/student-api && git commit -m "feat: define domain contracts and demo API"`.

### Task 3: PostgreSQL schema and migrations

**Files:** Create `packages/db/prisma/schema.prisma`, migration files, `packages/db/src/client.ts`, `packages/db/test/schema.int.test.ts`, `infrastructure/compose/compose.local.yml`.

**Interfaces:** Prisma models `User`, `Project`, `Release`, `Deployment`, `DeploymentEvent`, `ApiCredential`. Preserve spec fields and relations, unique `(projectId,workflowRunId)`, unique project slug/domain, ordered event `(deploymentId,sequence)`, and current release same-project application invariant. Export `db: PrismaClient` only from DB package.

- [ ] **Step 1 — Red:** Integration test starts local PostgreSQL and asserts unique run ID, unique domain, and event ordering constraint. Test password/credential hashes have no plaintext column. The same-project current-release invariant is enforced in Task 7's application transaction.
- [ ] **Step 2 — Run:** `corepack pnpm --filter @devdeploy/db test:integration`; expect missing schema/migration failure.
- [ ] **Step 3 — Implement:** Prisma schema and first migration; add DB-only Compose service bound to loopback for local tests; avoid storing app data in container writable layer.
- [ ] **Step 4 — Verify:** `docker compose -f infrastructure/compose/compose.local.yml up -d postgres && corepack pnpm --filter @devdeploy/db prisma:migrate && corepack pnpm --filter @devdeploy/db test:integration`; expect pass. Stop local stack after evidence capture.
- [ ] **Step 5 — Commit:** `git add packages/db infrastructure/compose/compose.local.yml && git commit -m "feat: persist platform domain records"`.

### Task 4: Administrator authentication and access guard

**Files:** Create `apps/api/src/auth/{auth.controller.ts,auth.service.ts,admin.guard.ts,csrf.guard.ts}`, `apps/api/test/auth.e2e-spec.ts`, `scripts/seed-admin.ts`.

**Interfaces:** `GET /api/v1/auth/csrf` issues a token bound to a short-lived anonymous or authenticated session; `POST /api/v1/auth/login` checks the token and creates an HttpOnly Secure SameSite session cookie; `GET /api/v1/auth/me` returns `{id,email}` for an active admin session; `POST /api/v1/auth/logout` revokes it. `AdminGuard` protects management endpoints. Seed one admin from a one-time secret sourced outside Git; hash with established library, no hardcoded password. State-changing browser calls send the CSRF token in `X-CSRF-Token`.

- [ ] **Step 1 — Red:** Supertest cases for CSRF issue and login validation, valid login/`me`/logout, wrong password, disabled user, no-cookie `401`, CSRF failure, `Secure/HttpOnly/SameSite` cookie attributes, and rate-limited repeated failures.
- [ ] **Step 2 — Run:** `corepack pnpm --filter @devdeploy/api test:e2e -- auth.e2e-spec`; expect failure.
- [ ] **Step 3 — Implement:** Auth service/guards, secure session persistence, seed command and `GET /api/v1/health/live`, `GET /api/v1/health/ready` (ready depends on DB).
- [ ] **Step 4 — Verify:** Re-run e2e and `corepack pnpm --filter @devdeploy/api typecheck`; inspect that session secrets are loaded only at runtime and never printed.
- [ ] **Step 5 — Commit:** `git add apps/api/src/auth apps/api/test/auth.e2e-spec.ts scripts/seed-admin.ts && git commit -m "feat: secure administrator access"`.

### Task 5: Project catalog

**Files:** Create `apps/api/src/projects/{projects.controller.ts,projects.service.ts}`, `apps/api/test/projects.e2e-spec.ts`.

**Interfaces:** `POST /api/v1/projects`, `GET /api/v1/projects`, `GET /api/v1/projects/:id`. Consume `parseProjectConfig`. Persist fixed repo/branch/namespace/domain/port/path; return project ID/status. No arbitrary Compose YAML or shell fields.

- [ ] **Step 1 — Red:** Tests cover valid project creation/list/detail; duplicate slug/domain `409`; malformed domain/path, foreign image namespace, invalid port `400`; unauthenticated `401`.
- [ ] **Step 2 — Run:** `corepack pnpm --filter @devdeploy/api test:e2e -- projects.e2e-spec`; expect failure.
- [ ] **Step 3 — Implement:** Controller/service and DB uniqueness handling. Configure one allowed repository and GHCR namespace for MVP via server config; no public sign-up.
- [ ] **Step 4 — Verify:** Focused e2e, then `corepack pnpm --filter @devdeploy/api test`; expect pass.
- [ ] **Step 5 — Commit:** `git add apps/api/src/projects apps/api/test/projects.e2e-spec.ts && git commit -m "feat: register managed project"`.

## Phase B — Trusted release pipeline (Weeks 4–5)

### Task 6: GitHub run and manifest verifier

**Files:** Create `apps/api/src/github/{github-run-verifier.ts,github-http.client.ts,manifest-parser.ts}`, `apps/api/test/github-run-verifier.spec.ts`, `apps/api/test/fixtures/release-manifest.json`.

**Interfaces:** `GitHubRunVerifier.verify(project: ProjectConfig, submitted: ReleaseIdentity): Promise<VerifiedRelease>`; `VerifiedRelease` includes digest, SHA, CI run ID and verified timestamp. Fetch run from configured repo using read-only GitHub Actions credential; require `status=completed`, `conclusion=success`, `event=push`, exact configured repo/branch/workflow, and matching run `head_sha`. Fetch only that run's named `release-manifest` artifact; parse a bounded single JSON file and compare all identity fields with request. On GitHub timeout/404/expired artifact, reject approval.

- [ ] **Step 1 — Red:** Mock GitHub HTTP responses for success and failed/in-progress run, wrong repo/branch/SHA/workflow, mismatched digest, missing artifact, oversized ZIP, traversal filename, decompression size overflow, duplicate JSON fields if parser permits ambiguity, and upstream timeout.
- [ ] **Step 2 — Run:** `corepack pnpm --filter @devdeploy/api test -- github-run-verifier.spec`; expect missing verifier failure.
- [ ] **Step 3 — Implement:** Read-only client with short timeout and bounded response; explicit allowlist for the GitHub API host to avoid URL injection. Limit compressed and extracted manifest size (64 KiB JSON), accept only exact manifest filename, fail closed. Preserve enough reason codes without logging credentials.
- [ ] **Step 4 — Verify:** Focused tests; verify no untrusted value is interpolated into a URL origin or shell. Capture a successful mock run and each rejection reason.
- [ ] **Step 5 — Commit:** `git add apps/api/src/github apps/api/test/github-run-verifier.spec.ts apps/api/test/fixtures && git commit -m "feat: verify GitHub CI provenance"`.

### Task 7: Release admission, idempotency, and queued attempts

**Files:** Create `apps/api/src/releases/{releases.controller.ts,releases.service.ts,credential.guard.ts}`, `apps/api/src/deployments/{deployments.controller.ts,deployments.service.ts}`, `apps/api/test/release-admission.e2e-spec.ts`, DB migration if required.

**Interfaces:** `POST /api/v1/ci/projects/:id/releases` accepts `ReleaseIdentity`, verifies project-scoped hashed workflow token and Task 6 result, and transactionally creates `Release` + `Deployment(status='queued')`; returns `202 {releaseId,deploymentId}`. Duplicate `(projectId,workflowRunId)` returns same IDs without a second job. `POST /api/v1/projects/:id/credentials` returns a new scoped token once; `POST /api/v1/projects/:id/credentials/:credentialId/revoke` revokes it. Admin can use `GET /api/v1/projects/:id/releases`, `GET /api/v1/projects/:id/deployments?cursor=...`, and `GET /api/v1/deployments/:id` for paginated history and ordered events. No Docker call from API.

- [ ] **Step 1 — Red:** Tests for approved manifest, wrong/revoked/expired token, wrong project, duplicate call, older completed run after newer active release, GitHub outage, cross-project current-release assignment, and no partial release when queue insertion fails.
- [ ] **Step 2 — Run:** `corepack pnpm --filter @devdeploy/api test:e2e -- release-admission.e2e-spec`; expect failure.
- [ ] **Step 3 — Implement:** Credential creation/rotation path restricted to admin, admission guard, transaction, idempotency, stale-release policy, history API and event ordering. Store credential hash only.
- [ ] **Step 4 — Verify:** Focused e2e and DB integration tests; assert API container config never declares a Docker socket mount.
- [ ] **Step 5 — Commit:** `git add apps/api/src/releases apps/api/src/deployments apps/api/test/release-admission.e2e-spec.ts packages/db && git commit -m "feat: admit and queue trusted releases"`.

### Task 8: GitHub workflows and release manifest

**Files:** Create `.github/workflows/{ci.yml,release.yml,scan-demo.yml}`, `apps/student-api/.gitleaks.toml` only if a deterministic test rule is required, `docs/ci.md`, `scripts/check-workflows.mjs`.

**Interfaces:** `ci.yml` triggers protected `main`: install/lint/test → Gitleaks → build → Trivy (`CRITICAL` with fix, reviewed exceptions only) → push GHCR by digest → upload `release-manifest` JSON with repo, branch, SHA, CI run ID, digest. `release.yml` triggers `workflow_run: completed` for `ci.yml`, checks success/repo/branch, uses protected environment secret, downloads only its manifest, never checks out untrusted completed-run code, then POSTs to Task 7 API. `scan-demo.yml` scans `demo/blocked-by-secrets` and `demo/blocked-by-vuln` without credentials or deploy job.

- [ ] **Step 1 — Red:** Static test asserts least-privilege `permissions`, release workflow has no source checkout or user-supplied shell interpolation, demo branches lack release credentials, and CI emits exact Task 6 manifest fields.
- [ ] **Step 2 — Run:** `node scripts/check-workflows.mjs`; expect missing workflow failure.
- [ ] **Step 3 — Implement:** Pin actions to reviewed commits; configure `contents: read`, `packages: write` only where needed, and deployment environment protection. Write a mock local fixture for CI-to-release contract before using real GHCR.
- [ ] **Step 4 — Verify:** Static check and YAML parse. On authorized test repo, record one protected-main CI success and a digest/manifest; separately show both demo-branch scans block without reaching release. Do not claim live verification if no GitHub access exists.
- [ ] **Step 5 — Commit:** `git add .github/workflows apps/student-api/.gitleaks.toml docs/ci.md scripts/check-workflows.mjs && git commit -m "ci: publish verified release manifest"`.

## Phase C — Deploy and recover (Weeks 6–7)

### Task 9: Worker queue, leases, and fixed runtime adapter

**Files:** Create `apps/deploy-worker/src/{main.ts,queue/job-repository.ts,queue/worker.ts,runtime/docker-compose-adapter.ts,runtime/project-template.ts}`, `apps/deploy-worker/test/{worker.int.test.ts,docker-compose-adapter.test.ts}`, `infrastructure/compose/project-template.yml`.

**Interfaces:** `claimNext(projectId?: string): Promise<Deployment|null>` locks the project row in a short DB transaction, refuses a second active attempt, and claims one queued job with a worker lease; `renewLease(id)` and `recordEvent(id,code,message)` are durable. An expired lease triggers Task 11 reconciliation before a new claim. `DockerRuntime.pull(digest)`, `start(project,slot,digest)`, `stop(project,slot)`, `inspect(project,slot)` accept validated typed inputs only. Template fixes networks, port, capabilities, resource ceilings, journald logging and no privileged mode/host mount; no caller-provided Compose text or shell command.

- [ ] **Step 1 — Red:** Concurrency test claims two queued jobs for one project with two worker instances: exactly one in flight. Adapter test rejects image outside configured namespace, invalid slug/port, shell metacharacters; rendered Compose has no privileged mode, Docker socket, or platform secret mount.
- [ ] **Step 2 — Run:** `corepack pnpm --filter @devdeploy/deploy-worker test -- worker.int.test docker-compose-adapter.test`; expect failure.
- [ ] **Step 3 — Implement:** Claim/lease logic, fixed rendering and argument-vector subprocess calls (`spawn` without shell), stdout/stderr redaction and bounded capture. Do not change active route in this task.
- [ ] **Step 4 — Verify:** Focused tests; render the safe fixture to `/tmp/devdeploy-test-project.yml`, run `docker compose -f /tmp/devdeploy-test-project.yml config`, and check no host ports exposed for app slots.
- [ ] **Step 5 — Commit:** `git add apps/deploy-worker/src apps/deploy-worker/test infrastructure/compose/project-template.yml && git commit -m "feat: claim jobs and start isolated app slots"`.

### Task 10: Health probes, traffic switch, and successful release

**Files:** Create `apps/deploy-worker/src/{probes/health-probe.ts,routing/route-file.ts,deploy/deploy-attempt.ts,deploy/recover.ts}`, `apps/deploy-worker/test/{health-probe.test.ts,deploy-attempt.int.test.ts}`, `infrastructure/traefik/{static.yml,dynamic/example.yml}`.

**Interfaces:** `probeInternal(project,slot,expectedSha,deadlineMs=90000)` and `probePublic(project,expectedSha,deadlineMs=30000)` require `/health` `200 {status:'ok'}` and `/version.commitSha=expectedSha`. `RouteFile.activate(project,slot): Promise<RouteSnapshot>` validates host/slot and writes a complete route file by atomic rename; `restore(snapshot)` replaces it. `recoverPrevious(attemptId,snapshot)` restores and verifies the old public SHA before marking `rolled_back`, or marks `recovery_failed`. `deployAttempt(id)` goes `queued→preparing→probing→switching→succeeded` only after public probe; update current release after verified route.

- [ ] **Step 1 — Red:** Fake runtime/router tests for healthy rollout, pre-switch failure keeps old route, public route remains on old SHA after switch request (must restore and verify prior route), malformed response, timeout, and first-release failure without fabricated rollback.
- [ ] **Step 2 — Run:** `corepack pnpm --filter @devdeploy/deploy-worker test -- health-probe.test deploy-attempt.int.test`; expect failure.
- [ ] **Step 3 — Implement:** Probe and route adapters, success path, and basic verified automatic recovery; private Traefik file-provider network, route parent directory mounted so file replacement is observable. Keep previous running slot 30 minutes; never stop it before new public check.
- [ ] **Step 4 — Verify:** Focused tests, Traefik configuration validation, local good-image integration check: `curl -fsS https://<test-domain>/version` returns new SHA. If no domain/TLS is authorized, report local-only gate as pending.
- [ ] **Step 5 — Commit:** `git add apps/deploy-worker/src apps/deploy-worker/test infrastructure/traefik && git commit -m "feat: verify and switch healthy release"`.

### Task 11: Recovery, manual rollback, and startup reconciliation

**Files:** Modify `apps/deploy-worker/src/deploy/{deploy-attempt.ts,recover.ts}`; create `apps/deploy-worker/src/{queue/reconcile.ts,runtime/image-retention.ts}`, `apps/api/src/deployments/rollback.controller.ts`, `apps/deploy-worker/test/{recover.int.test.ts,reconcile.int.test.ts}`, `apps/api/test/rollback.e2e-spec.ts`.

**Interfaces:** Extend Task 10's `recoverPrevious(attemptId,snapshot)` for failed restoration and interrupted operations. `reconcileOnStartup()` compares DB attempted/current state to route file, Docker slots, and public version before claiming another job. `POST /api/v1/projects/:id/deployments {releaseId}` queues a manual deploy of an approved release; `POST /api/v1/projects/:id/rollbacks {releaseId}` queues an earlier successful release. Both return `202 {deploymentId}`, reject an active project attempt with `409`, and never rewrite history.

- [ ] **Step 1 — Red:** Tests for failed candidate before switch, failed public probe after switch, failed recovery, worker crash between route write and DB commit, duplicate worker restart, manual target absent from GHCR/cache, old image re-pull success, unauthorized rollback, and concurrent rollback `409`.
- [ ] **Step 2 — Run:** `corepack pnpm --filter @devdeploy/deploy-worker test -- recover.int.test reconcile.int.test && corepack pnpm --filter @devdeploy/api test:e2e -- rollback.e2e-spec`; expect failure.
- [ ] **Step 3 — Implement:** Recovery statuses/events, reconciliation policy, new rollback attempt, 30-minute old-slot cleanup and image-retention guard. Do not claim `rolled_back` without verified public old version. Preserve route on missing registry image.
- [ ] **Step 4 — Verify:** Focused tests; deploy a deliberately unhealthy **safe test image** on an authorized local host and confirm old `/version` returns HTTP 200. Record any transient 502 as an availability failure.
- [ ] **Step 5 — Commit:** `git add apps/deploy-worker apps/api/src/deployments apps/api/test/rollback.e2e-spec.ts && git commit -m "feat: recover failed releases and reconcile"`.

### Task 12: Production-style host Compose and worker service

**Files:** Create `infrastructure/compose/compose.platform.yml`, `infrastructure/systemd/devdeploy-worker.service`, `infrastructure/traefik/static.yml` (extend), `scripts/check-host-config.sh`, `docs/operations.md`.

**Interfaces:** API/web/DB private networks; only Traefik 80/443 exposed; worker host service under dedicated non-login user, its user the only non-root identity with Docker socket control and route-directory write access. Root retains access. Secrets external to Git. DNS/TLS/ACME configured through placeholders; no fabricated certs.

- [ ] **Step 1 — Red:** Config test checks API/web/Alloy have no Docker socket, DB/Prometheus/Loki no public ports, worker user and route directory ownership documented, Traefik dynamic directory read-only in container.
- [ ] **Step 2 — Run:** `bash scripts/check-host-config.sh`; expect failure until files exist.
- [ ] **Step 3 — Implement:** Compose/systemd/config, SSH/UFW deployment runbook, installation and emergency manual-route restore procedure. Avoid direct deployment onto any existing production host without an authorized maintenance window.
- [ ] **Step 4 — Verify:** `docker compose -f infrastructure/compose/compose.platform.yml config && bash scripts/check-host-config.sh`; on an authorized disposable host, test HTTPS, login, and inbound port exposure. Capture redacted results.
- [ ] **Step 5 — Commit:** `git add infrastructure/compose infrastructure/systemd infrastructure/traefik scripts/check-host-config.sh docs/operations.md && git commit -m "ops: define isolated single-host runtime"`.

## Phase D — Operator experience and observability (Week 8)

### Frontend design brief

**User and purpose:** One administrator uses the dashboard to understand what version is serving traffic, why a release failed, and what action is safe next. This is an operations console; charts and log storage remain in Grafana/Loki.

**Navigation and page contracts:**

| Route | Main content | Primary action | API read |
| --- | --- | --- | --- |
| `/login` | Email/password, validation error, session timeout | Sign in | `GET /auth/csrf`, `POST /auth/login` |
| `/dashboard` | Project count, healthy/unhealthy count, latest attempt, recent failures | Open affected project | `GET /projects`, latest attempts via project queries |
| `/projects` | Searchable project list with domain, active SHA, health, last attempt | Open project / create project | `GET /projects`, `POST /projects` |
| `/projects/[id]` | Current serving SHA and digest, public URL, health, CI-approved releases and attempts | Deploy approved release / rollback previous success | `GET /projects/:id`, `GET /projects/:id/releases`, `GET /projects/:id/deployments` |
| `/deployments/[id]` | Attempt state, timeline, CI run link, target/previous SHA, failure code, recovery result | Return to project | `GET /deployments/:id` |

**Visual hierarchy:** Desktop uses a compact left navigation (`Overview`, `Projects`) and a top bar with the signed-in account and logout. Mobile uses a top navigation and stacked cards. Main content max width 1200px, 8px spacing scale, system font, slate background, neutral cards, one cyan action accent. Badges use both text and color: green `Succeeded/Healthy`, amber `Queued/Preparing/Probing/Switching`, red `Failed/Recovery failed`, blue `Rolled back`. Do not use color alone. Tables become readable cards at 360px; no horizontal scrolling for primary actions. Use semantic headings, keyboard focus, labels, and accessible confirmation dialogs.

**Action behavior:** `Deploy` selects an approved release, shows SHA/digest, and requires confirmation. `Rollback` selects a previously successful release and warns it creates a new attempt. Disable actions during an active attempt. A `202` means **queued**, not successful: navigate to the attempt detail and poll `GET /deployments/:id` every 3 seconds only while nonterminal. Stop polling on terminal status, tab unmount, or auth failure; provide a Retry button for network errors. Use explicit loading, empty, unauthorized, failed-request, and `recovery_failed` states. A failed candidate never replaces the displayed current serving SHA.

**Same-origin integration:** Traefik sends `/api/v1/*` to NestJS and page routes to Next.js on `https://devdeploy.example.com`. Browser fetches relative `/api/v1/...` with same-origin cookies and `X-CSRF-Token` on mutations. Server Components call the private API address with forwarded cookies and `cache: 'no-store'`; do not forward the workflow token or GHCR credentials. Login redirects to the requested protected page after success; `401` redirects to login, `403` shows access denied, `409` shows the active attempt, validation errors stay beside fields, and `5xx` shows a retryable error. No client-side persistence of session or secrets.

### Task 13: Dashboard visual shell and states

**Files:** Create `apps/web/app/{layout.tsx,login/page.tsx,dashboard/page.tsx,projects/page.tsx,projects/[id]/page.tsx,deployments/[id]/page.tsx}`, `apps/web/components/{app-shell.tsx,status-badge.tsx,deployment-timeline.tsx,confirm-action.tsx,ui-state.tsx}`, `apps/web/styles/globals.css`, `apps/web/test/visual-states.spec.ts`.

**Interfaces:** Presentational components accept typed `ProjectSummary`, `ReleaseSummary`, `DeploymentDetail`, and `DeploymentEvent` from `@devdeploy/contracts` (add view-only types there). Render the five routes with fixture data, all status labels, empty/loading/error states, and a confirmation dialog. No live API mutations in this task.

- [ ] **Step 1 — Red:** Browser/component tests assert each route title and key fields; status badges expose text and color-independent label; `recovery_failed` has prominent remediation text; 360px view has no horizontal overflow; confirmation dialog has accessible label and keyboard dismissal.
- [ ] **Step 2 — Run:** `corepack pnpm --filter @devdeploy/web test:e2e -- visual-states.spec`; expect failure.
- [ ] **Step 3 — Implement:** Build shell and presentational pages using the frontend design brief. Render fixture states through an injectable page data provider rather than hardcoding business decisions into JSX.
- [ ] **Step 4 — Verify:** Focused tests plus web build; inspect screenshots at 360px and 1280px, check focus order and status clarity. Do not claim live integration yet.
- [ ] **Step 5 — Commit:** `git add apps/web packages/contracts && git commit -m "feat: design DevDeploy operator dashboard"`.

### Task 14: Frontend authentication and API integration

**Files:** Create `apps/web/lib/{api-client.ts,session.ts,csrf.ts,poll-deployment.ts}`, `apps/web/components/{project-form.tsx,deploy-action.tsx,rollback-action.tsx}`, `apps/web/test/{auth-flow.spec.ts,deployment-flow.spec.ts}`; modify Task 13 pages and `infrastructure/traefik/dynamic/example.yml` for same-origin routing.

**Interfaces:** `apiClient.get<T>(path,cookie?)` and `apiClient.mutate<T>(method,path,body,csrfToken)` use only allowed relative `/api/v1` paths; typed errors carry HTTP status/code. `getCurrentAdmin(cookie)` calls `/auth/me`; `pollDeployment(id,onUpdate,signal)` requests `/deployments/:id` at 3-second intervals while nonterminal. Form actions use the exact Task 4/5/7/11 API fields. Server-rendered reads forward the incoming cookie, opt out of cache, and redirect on `401`; browser writes use same-origin credentials and CSRF header.

- [ ] **Step 1 — Red:** Mock API/browser tests: login cookie + CSRF, `me` guard redirects, create project validation, list/detail/history mapping, `202` remains queued until poll returns terminal, rollback `409` links current attempt, public version remains old after failed candidate, network retry stops polling on unmount, and workflow token never appears in browser bundle.
- [ ] **Step 2 — Run:** `corepack pnpm --filter @devdeploy/web test:e2e -- auth-flow.spec deployment-flow.spec`; expect failure.
- [ ] **Step 3 — Implement:** Wire API client, same-origin Traefik routing, auth/session and CSRF, project form, deploy/rollback confirmation, polling and terminal/error states. Validate DTO fields at the integration boundary; do not infer success from `202`.
- [ ] **Step 4 — Verify:** Focused tests, web typecheck/build, plus authorized local-stack browser run against real NestJS and PostgreSQL: login → create/view project → see seeded release → queue attempt → see timeline. Record any live-worker-only check as pending until host is available.
- [ ] **Step 5 — Commit:** `git add apps/web infrastructure/traefik/dynamic/example.yml && git commit -m "feat: integrate dashboard with deployment API"`.

### Task 15: Metrics, logs, and basic alerts

**Files:** Create `infrastructure/monitoring/{prometheus.yml,grafana/dashboards/devdeploy.json,grafana/provisioning/datasources.yml,alloy.alloy,loki.yml}`, extend `infrastructure/compose/compose.platform.yml`, `docs/observability.md`, `scripts/check-observability.sh`.

**Interfaces:** Node Exporter host metrics; cAdvisor container metrics if it works with reviewed read-only mounts; API and student app `/metrics` request/error/latency. Docker sample app uses journald logging driver; Alloy reads host journal without Docker socket and sends log entries to Loki with `project/service/environment` labels. Alerts: app unavailable 2 minutes, disk >85% 10 minutes, recovery_failed immediately.

- [ ] **Step 1 — Red:** Config checks: Prometheus targets and Grafana data sources provisioned, Alloy contains journal source and no Docker socket, labels do not use request ID, retention configured; API metrics test counts request/5xx and latency.
- [ ] **Step 2 — Run:** `bash scripts/check-observability.sh && corepack pnpm --filter @devdeploy/api test -- metrics.spec`; expect failure.
- [ ] **Step 3 — Implement:** Configs, metrics, dashboards and alert rules. If cAdvisor requires socket access or unsafe mounts on target Docker version, record a decision and use host/app metrics first rather than silently weakening the boundary.
- [ ] **Step 4 — Verify:** Focused tests and, on authorized host, generate traffic/error and inspect Prometheus target health, Grafana panels, and a corresponding Loki log line. Verify journal access and log rotation.
- [ ] **Step 5 — Commit:** `git add infrastructure/monitoring infrastructure/compose/compose.platform.yml apps/api docs/observability.md scripts/check-observability.sh && git commit -m "ops: observe releases and application health"`.

## Phase E — Recovery evidence and final quality (Weeks 9–10)

### Task 16: Backups, restore drill, and retention

**Files:** Create `scripts/{backup-platform.sh,restore-platform.sh,verify-backup.sh}`, `infrastructure/systemd/{devdeploy-backup.service,devdeploy-backup.timer}`, `docs/backup-restore.md`, `scripts/test-backup.sh`.

**Interfaces:** Daily protected PostgreSQL dump/checksum plus Compose/Traefik config snapshot; retain seven daily/four weekly with guarded pruning. `restore-platform.sh` requires an isolated target connection string and explicit confirmation for any live target; never silently overwrites current DB. After restore, worker reconciliation compares DB with actual host state.

- [ ] **Step 1 — Red:** Tests reject empty/unsafe target and world-readable backup, simulate failed dump/checksum, preserve active/current backup during retention, verify an isolated restored DB has expected project/deployment rows.
- [ ] **Step 2 — Run:** `bash scripts/test-backup.sh`; expect failure.
- [ ] **Step 3 — Implement:** Scripts and timer with restrictive permissions, no plaintext password in command line, log-safe errors, and documented separate storage destination. Include manual host/DNS recovery outline.
- [ ] **Step 4 — Verify:** On authorized disposable PostgreSQL, create known records, dump, restore to **different** DB, compare schema/rows, and record elapsed time. Check timer scheduling and seven-daily/four-weekly rotation.
- [ ] **Step 5 — Commit:** `git add scripts/backup-platform.sh scripts/restore-platform.sh scripts/verify-backup.sh scripts/test-backup.sh infrastructure/systemd/devdeploy-backup.* docs/backup-restore.md && git commit -m "ops: back up and restore platform state"`.

### Task 17: End-to-end gates, security evidence, and documentation

**Files:** Create `tests/e2e/release-flow.spec.ts`, `scripts/smoke.sh`, `docs/{security.md,test-report.md,practicum-report.md}`, update `README.md`, `docs/operations.md`, `docs/progress.md`.

**Interfaces:** Evidence matrix maps G1–G7 to a command/run URL/screenshot and observed result. Smoke probes use `curl --fail-with-body` for `/health` and compare `/version.commitSha` with DB current release. The final report describes actual resource/capacity measurements and limits, not just planned targets.

- [ ] **Step 1 — Red:** End-to-end scenario asserts good A→B release, CI gate rejection, failing C keeps/restores B, manual rollback to A, ordered events and logs, and restored DB row counts. Add 20 sequential release attempts and 1 RPS/10-minute measurement scripts on a disposable host.
- [ ] **Step 2 — Run:** `corepack pnpm test:e2e && bash scripts/smoke.sh`; expect failure before completing wiring/evidence.
- [ ] **Step 3 — Implement:** Fix integration gaps only, document commands and actual observations, add failure/incident runbook and final demonstration script. No unrelated stretch feature.
- [ ] **Step 4 — Verify:** `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build && corepack pnpm test:e2e`; run `agent.md`'s full pre-push secret/history/bundle review before publishing any branch. On authorized demo infrastructure, run `bash scripts/smoke.sh` and isolated restore. A failed gate stays reported as failed/pending; do not claim a live deployment from mocks.
- [ ] **Step 5 — Commit:** `git add tests scripts/smoke.sh docs README.md && git commit -m "test: prove DevDeploy practicum acceptance gates"`; tag a release only after all required G1–G7 gates pass and user has authorized release.

## Milestones and stop conditions

| Gate | Must be observable | If blocked |
| --- | --- | --- |
| End Week 3 | Admin logs in, creates sample project, sees seeded release | Fix data/auth; do not polish UI |
| End Week 4 | Protected-main CI publishes an image to GHCR by digest and emits matching manifest | Do not start live deploy work without traceable artifact |
| End Week 5 | API rejects forged/mismatched run and accepts successful run once | Fix provenance before worker trusts queue |
| End Week 6 | One push updates public HTTPS `/version` to new SHA | Prioritize route/probe over dashboards |
| End Week 7 | Bad image leaves/restores old SHA over HTTP 200 and records events | Fix rollback/reconciliation before metrics polish |
| End Week 8 | Metrics and logs correlate with an attempt | If behind, minimal app/host metrics and journal logs first |
| End Week 9 | DB restore on isolated target; acceptance matrix complete | No new features |
| End Week 10 | Report, evidence, reproducible README, rehearsed demo | Tag only if all required gates pass |

## Agent handoff prompt

Paste this to a coding agent after placing **both** this plan and the spec in the repository:

> Read `docs/devdeploy-practicum-specification.md` and `docs/superpowers/plans/2026-09-28-devdeploy-implementation.md` completely. Execute **Task 1 only** on a fresh branch. Follow its red/green checks, preserve the security and single-host constraints, commit only files for that task, and report changed files, test output, commit SHA, and any blocked external gate. Do not claim GitHub/server deployment without running it. Wait for review before Task 2. Continue task by task after approval.

## Plan self-review

- Spec coverage: project identity, stateless app, schema, authentication, provenance, CI gates, deployment, route verification, rollback, crash recovery, frontend design and integration, metrics/logs, backup, capacity and evidence all map to Tasks 1–17.
- Review Focus: malformed CI artifact (Task 6); duplicate/stale runs (Task 7); stale public route (Task 10); crash and missing registry image (Task 11).
- Deployment privilege: only worker controls Docker/routing; cAdvisor access must be reviewed before enabling; Alloy uses journal without socket.
- External services: workflow and DNS/TLS/host gates explicitly require a real authorized environment; local tests cannot substitute for them.
