# CI/CD and Provenance

**Status:** Planned. Replace workflow descriptions with actual run URLs and pinned action revisions after Task 8.

Protected `main` CI: lint → tests → Gitleaks → build → Trivy gate → push GHCR → publish release-manifest artifact. A separate `workflow_run: completed` release workflow uses a protected environment secret only for a successful configured CI run. It does not check out code from the completed run.

The API fetches the CI run and its manifest using read-only GitHub access. It checks completed/success status, repository, branch, workflow, commit SHA, manifest and `ghcr.io/...@sha256:...` digest. Missing/mismatched GitHub evidence fails closed. A duplicate run returns the original attempt. Scanner demo branches do not deploy.

## Evidence to record

| Gate | Run URL / commit | Result | Date |
| --- | --- | --- | --- |
| Lint and tests | Pending | Pending | Pending |
| Gitleaks fake-secret demo | Pending | Pending | Pending |
| Trivy controlled demo | Pending | Pending | Pending |
| Image digest and manifest | Pending | Pending | Pending |
| Rejected forged/mismatched submission | Pending | Pending | Pending |
| Successful release notification | Pending | Pending | Pending |

No real credentials, manifest bearer tokens, or private workflow secret values belong in this file.
