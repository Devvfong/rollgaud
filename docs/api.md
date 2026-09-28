# API Contract

**Status:** Proposed endpoints. Verify paths, request/response schemas and OpenAPI output against the implemented NestJS API before release.

Base path: `/api/v1`. Next.js pages and API share one HTTPS origin. Browser mutations carry session cookie and `X-CSRF-Token`; CI admission uses a separate project-scoped bearer credential.

| Method | Path | Caller | Expected result |
| --- | --- | --- | --- |
| GET | `/auth/csrf` | Browser | Session-bound CSRF token |
| POST | `/auth/login` | Browser | Secure HttpOnly session cookie |
| GET | `/auth/me` | Browser | Current admin or `401` |
| POST | `/auth/logout` | Browser | Revoked session |
| GET/POST | `/projects` | Admin | List/create validated projects |
| GET | `/projects/{id}` | Admin | Project and active release |
| GET | `/projects/{id}/releases` | Admin | Approved image digests |
| GET | `/projects/{id}/deployments?cursor=...` | Admin | Paginated attempts |
| GET | `/deployments/{id}` | Admin | Attempt and ordered events |
| POST | `/projects/{id}/deployments` | Admin | `202 {deploymentId}` for approved release |
| POST | `/projects/{id}/rollbacks` | Admin | `202 {deploymentId}` for prior successful release |
| POST | `/projects/{id}/credentials` | Admin | One-time scoped CI token |
| POST | `/projects/{id}/credentials/{credentialId}/revoke` | Admin | Revoke CI token |
| POST | `/ci/projects/{id}/releases` | CI workflow | `202 {releaseId,deploymentId}` after independent GitHub verification |
| GET | `/health/live`, `/health/ready` | Probe | Process liveness / DB-backed readiness |

`202` means **queued**, never deployment success. `401` unauthenticated, `403` forbidden, `409` conflicting active attempt or duplicate domain, `422` malformed input, and `5xx` server failure. Final API implementation should return stable `{code,message,requestId}` errors without leaking secrets. Record actual schema examples and generated OpenAPI URL after Task 7.

**Evidence pending:** actual OpenAPI export, authorization test output, UI integration run, error response samples.
