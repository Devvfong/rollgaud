# DevDeploy Agent Instructions

This file guides coding agents working on DevDeploy. The root `AGENTS.md` directs agents here. Keep this file in the repository root.

## Project goal

Build a **single-host, self-hosted deployment controller**. GitHub Actions tests, scans, builds, and publishes a Docker image. DevDeploy verifies the completed CI run, deploys the approved image by digest, checks the application, switches HTTPS traffic, restores the last healthy route if the release fails, and shows history, metrics, and logs. The demonstration uses one stateless `student-api` and one Ubuntu host.

## Read before changing anything

1. `docs/devdeploy-practicum-specification.md` — product scope, contracts, boundaries, acceptance goals G1–G7.
2. `docs/superpowers/plans/2026-09-28-devdeploy-implementation.md` — 17 ordered tasks, file ownership, tests, weekly gates.
3. `docs/decisions.md` and `docs/progress.md` if they exist.
4. Existing repository instructions, configuration, and `git status` before modifying files.

The approved documents are supplied separately as `devdeploy-practicum-specification.md` and `2026-09-28-devdeploy-implementation.md`. Place them at the paths above before Task 1. If either is missing, request the actual file; do not recreate its contents from memory. If these instructions conflict with a direct user request, follow the user request and record the resulting design change.

## How to work

- Start at the first incomplete task in the plan. Keep each change within its task's files and stated interfaces. A task should end with a working, reviewable result and evidence for its checks.
- For behavior changes, write a meaningful failing test, observe the failure, implement, then run the focused test and relevant package checks. Avoid tests that merely copy implementation details.
- Before editing, inspect adjacent code and preserve unrelated work. Do not reset a dirty tree, overwrite user changes, or restructure the repository without cause.
- Run commands from the plan using `corepack pnpm`; document any necessary substitution and why. Pin actual dependencies and GitHub Actions revisions in the repository lockfile/workflows.
- Use one focused commit per finished task when working in a Git repository, unless the user directs otherwise. Never commit `.env`, credentials, OAuth keys, registry tokens, or generated secret files.
- Update `docs/progress.md` with the task, commit SHA, commands and actual results, blocked checks, and the next task. Log architecture deviations in `docs/decisions.md` before relying on them.
- Continue task by task when the user has authorized full implementation. If the user explicitly asks for Task 1 only, stop after reporting Task 1. Do not describe a mock result as a verified live deployment.

## Required boundaries

### Release provenance

- Only the configured protected `main` workflow can approve a release. The NestJS API verifies that the GitHub CI run is completed and successful and that its repository, branch, workflow, commit SHA, and release-manifest artifact match the submitted immutable GHCR digest.
- Reject missing, mismatched, expired, malformed, or oversized manifests. A workflow bearer token by itself is insufficient proof. Duplicate notifications return the original attempt; stale runs never replace a newer active release.
- The privileged release workflow must not check out or run code from an untrusted `workflow_run` event. Demonstration scanner branches never receive deployment credentials.

### Host and deployment

- The public Next.js and NestJS services have **no Docker socket** or route-directory write access. Only the dedicated host-local worker can manage Docker and Traefik route files. Docker access is effectively host-level privilege.
- Render only fixed, validated Compose and route templates. Never pass project values to a shell interpreter, accept caller-supplied Compose YAML, enable privileged app containers, or mount host secrets into deployed apps.
- Serialize attempts per project. Keep the old route until candidate internal health passes. After switching, require public `/health` and `/version.commitSha` to match the target before recording success.
- If post-switch verification fails, restore the previous route and verify the previous public SHA. A `rolled_back` state requires that proof; `recovery_failed` requires operator attention. A first failed release has no previous version to restore.
- After worker restart, reconcile DB records with actual route/container state before claiming more jobs. An unavailable old registry image must leave the current healthy route intact.
- Never assume `docker compose up -d` or HTTP `202` means the deployment succeeded.

### API and frontend

- Serve web pages and `/api/v1/*` on the same HTTPS origin. Browser calls use relative paths, same-origin cookies, and CSRF headers for mutations; server-rendered calls forward the user session without caching private responses.
- Build the five specified views: login, overview, projects, project detail, deployment attempt. Follow the frontend design brief in the plan for layout, responsive behavior, accessible status labels, empty/error states, and confirmation dialogs.
- A submitted deploy or rollback request is **Queued** until the worker reaches a terminal state. Poll only while active. Display the actual currently serving SHA even when a candidate fails. Link a `409` to the already active attempt.
- Do not put workflow credentials, GHCR pull secrets, or internal API URLs in the browser bundle.

### Data, logs, and recovery

- PostgreSQL stores projects, CI-approved releases, attempts, ordered events, and the current active release. A manual rollback is a **new attempt**; never erase history or overwrite an old release.
- Keep credentials and full environment dumps out of `deployment_events` messages/metadata. Alloy reads journal logs without a Docker socket; Grafana/Loki do not replace the database audit trail.
- Back up platform PostgreSQL plus Compose/Traefik configuration; prove a restore into an isolated database. The sample application is stateless and its external data is outside platform backup scope.

## Mandatory pre-push publication gate

Before the first public push and every later push, inspect staged and working files, every local ref and reachable commit, CI configuration, Dockerfiles, built frontend assets, and runtime configuration. Run Gitleaks against history and the current tree with full redaction, and record only command results, commit IDs, paths, and rule IDs.

The publication branch must not track real credentials, private keys, credential-bearing URLs, private host details, `.env`, `.qodo/`, `documentation/`, or archives. `.env.example` contains deliberately non-working placeholders only. Real configuration is injected at runtime from protected environment/files or GitHub Actions secrets, and required configuration must fail closed when missing or malformed; never use a hardcoded secret fallback.

If a real credential or private key is found, stop publication. Revoke and rotate it with the issuing service, remove it from every reachable history ref using an approved rewrite, rerun this gate, and obtain explicit authorization before any force-push. Do not copy the value into logs, reports, tickets, or command output. The eventual CI workflow must enforce equivalent scans before image publication or release notification.

## Verification and reporting

For each task, report:

```text
Task:
Changed files:
Focused test (command + result):
Other checks (command + result):
Commit SHA (if committed):
Live GitHub/server gate (verified or pending, with evidence):
Risks or deviations:
Next task:
```

The final acceptance evidence must cover G1–G7: protected push and security gates, verified HTTPS release, bad-release recovery, manual rollback, linked metrics/logs/events, and isolated backup restore. Run the full lint, typecheck, test, build, end-to-end, and smoke gates before claiming completion. If infrastructure or credentials are unavailable, finish local work, record the live gate as pending, and identify the exact input needed to run it. Avoid pushing, deploying, changing DNS, or touching a live host unless the user has authorized that target and action.
