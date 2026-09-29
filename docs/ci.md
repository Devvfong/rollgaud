# CI/CD and Provenance

**Status:** Workflow source and immutable action revisions are implemented locally. Replace pending evidence with actual run URLs only after an authorized protected-main run.

Protected `main` CI: lint → tests → Gitleaks → build → Trivy gate → push GHCR → publish release-manifest artifact. The image is scanned before it is pushed. The artifact JSON contains exactly `repository`, `branch`, `workflowRunId`, `commitSha`, and `imageDigest`, matching the Task 6 parser and Task 7 request.

A separate `workflow_run: completed` release workflow runs only for a successful `CI` push from this repository's `main` branch. It does not check out or execute code from the completed run. It downloads only that run's manifest, validates it against the triggering run, and submits it from the protected `devdeploy-production` environment.

The API fetches the CI run and its manifest using read-only GitHub access. It checks completed/success status, repository, branch, workflow, commit SHA, manifest and `ghcr.io/...@sha256:...` digest. Missing/mismatched GitHub evidence fails closed. A duplicate run returns the original attempt. Scanner demo branches do not deploy.

## Protected environment configuration

Configure these values only in `devdeploy-production`:

- Secret `DEVDEPLOY_API_URL`: HTTPS DevDeploy API base URL without embedded credentials.
- Secret `DEVDEPLOY_WORKFLOW_TOKEN`: one project-scoped credential issued by the API.
- Variable `DEVDEPLOY_PROJECT_ID`: the managed project UUID.

The default GitHub token is used only for repository scanning, GHCR publishing, and downloading the triggering artifact. The isolated `demo/blocked-by-secrets` and `demo/blocked-by-vuln` branches run scanners only; they have no deployment environment, release credential, or API submission path.

## Evidence to record

| Gate | Run URL / commit | Result | Date |
| --- | --- | --- | --- |
| Lint and tests | Pending | Pending | Pending |
| Gitleaks fake-secret demo | Pending | Pending | Pending |
| Trivy controlled demo | Pending | Pending | Pending |
| Image digest and manifest | Pending | Pending | Pending |
| Rejected forged/mismatched submission | Pending | Pending | Pending |
| Successful release notification | Pending | Pending | Pending |

No real credentials, manifest bearer tokens, private host details, or private workflow secret values belong in this file. Local evidence is limited to `node scripts/check-workflows.mjs` and YAML parsing. A protected-main CI run, GHCR digest, environment approval, and release API submission remain pending until an authorized remote is configured.
