# Architecture Decisions

Record implementation choices that change or clarify the approved specification. Include date, reason, alternatives, consequence and owner. Do not rewrite earlier decisions; append a superseding entry.

| Date | Decision | Reason / alternative | Impact | Status |
| --- | --- | --- | --- | --- |
| 2026-09-28 | Baseline: one host, stateless demo app, Next.js/NestJS, PostgreSQL, host worker, Traefik file routes | Approved practicum scope; see specification | Limits general hosting claims | Proposed |

| 2026-09-28 | Task 1 pins Node.js 24.21.0, pnpm 12.6.0, and TypeScript 5.9.3 | Node.js 24.21.0 and pnpm 12.6.0 are available in the local toolchain; an exact TypeScript version makes workspace typechecks reproducible | Later tasks add framework/runtime dependencies explicitly | Accepted |

| 2026-09-28 | Task 2 pins `@types/node` 24.19.0 and the student API Docker base image `node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2` | Node 24 type declarations match the runtime major; the image digest makes the local sample build reproducible | Contracts and student API compile/test with Node's built-in test runner; image updates require an explicit review | Accepted |

| 2026-09-28 | Task 3 pins Prisma and `@prisma/client` 6.19.0, plus PostgreSQL `17.7-alpine3.22@sha256:6b591f995765a189e69276dd55e0b362342d65d10d0359bb1fab67bc3391f20f` | Prisma 6.19.0 supports Node `>=18.18` and avoids adopting the available major-release candidate; the PostgreSQL digest fixes the local integration image | Prisma lifecycle scripts are explicitly approved in `pnpm-workspace.yaml`; dependency or image upgrades require review and a fresh migration/integration run | Accepted |

**Next entry:** Record actual dependency/image revisions and any changes needed during Task 1.
