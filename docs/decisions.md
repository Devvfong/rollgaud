# Architecture Decisions

Record implementation choices that change or clarify the approved specification. Include date, reason, alternatives, consequence and owner. Do not rewrite earlier decisions; append a superseding entry.

| Date | Decision | Reason / alternative | Impact | Status |
| --- | --- | --- | --- | --- |
| 2026-09-28 | Baseline: one host, stateless demo app, Next.js/NestJS, PostgreSQL, host worker, Traefik file routes | Approved practicum scope; see specification | Limits general hosting claims | Proposed |

| 2026-09-28 | Task 1 pins Node.js 24.21.0, pnpm 12.6.0, and TypeScript 5.9.3 | Node.js 24.21.0 and pnpm 12.6.0 are available in the local toolchain; an exact TypeScript version makes workspace typechecks reproducible | Later tasks add framework/runtime dependencies explicitly | Accepted |

**Next entry:** Record actual dependency/image revisions and any changes needed during Task 1.
