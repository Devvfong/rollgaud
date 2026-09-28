# Architecture

**Status:** Planned; verify actual deployment topology during Tasks 9–14.

## Components and trust

| Component | Responsibility | Privilege |
| --- | --- | --- |
| GitHub Actions | Test, scan, build, publish digest and manifest | Scoped workflow/environment token |
| Next.js | Admin pages and same-origin API calls | No Docker/host access |
| NestJS API | Auth, GitHub run verification, project/release/attempt records | PostgreSQL access; no Docker socket |
| PostgreSQL | Source of record for control-plane state | Private network only |
| Host worker | Pull image, start slot, check health, change Traefik route, recover | Host-level Docker access; private service |
| Traefik | HTTPS, page/API routes, active app slot | Read-only dynamic route files |
| Prometheus/Grafana/Alloy/Loki | Metrics, dashboards and logs | No public metrics/log storage ports |

## Release sequence

1. Protected-main CI runs lint, tests, Gitleaks and Trivy, then pushes an image by digest.
2. A completed-run release workflow submits CI run ID, commit, and digest.
3. API independently checks the successful GitHub run and matching release manifest.
4. Worker serializes the project job, starts inactive slot, probes `/health` and `/version`.
5. Worker switches a Traefik file-provider route, verifies public HTTPS and expected commit SHA, then marks success.
6. On failure, worker retains or restores the previous route and records the verified result.

See specification Sections 4–8 for domain ownership, failure states, reconciliation and schema. During implementation attach real Compose network diagram, actual port map, and a redacted deployment event trace here.

**Evidence pending:** deployed host diagram; Docker Compose configuration validation; public route/version proof; crash-reconciliation run.
