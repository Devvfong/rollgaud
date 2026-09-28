# Security Model and Findings

**Status:** Planned controls. Actual scanner findings, decisions and tests must be added from implementation runs.

| Threat | Intended control | Evidence status |
| --- | --- | --- |
| Forged CI submission | Scoped token **plus** GitHub successful-run and manifest verification | Pending |
| Secret committed | Gitleaks CI gate; protected environment secrets | Pending |
| Vulnerable image | Trivy policy: block reviewed `CRITICAL` with available fix | Pending |
| Public API compromise to Docker | Separate host worker; no API Docker socket | Pending |
| Arbitrary image/host command | Namespace/digest allowlist; fixed templates; no shell interpolation | Pending |
| Unauthorized rollback | Admin session, CSRF and per-project active attempt lock | Pending |
| Exposed telemetry/DB | Internal networks and no public ports | Pending |
| Sensitive logs | Redaction; no secrets in deployment event metadata | Pending |

Docker socket access grants broad host control, including when used by a dedicated worker account. The MVP limits who receives it; it does not claim sandboxed execution of arbitrary untrusted customer images. The single host is also a single point of failure.

## Finding log

| Finding ID | Source/run | Severity | Impact | Decision and owner | Verification |
| --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | Pending | Pending | Pending |

For demo scans, use known fake secrets and a controlled, pre-verified vulnerable image on non-deployable branches. Never expose real secrets or deploy the vulnerable image to the public host.

## Mandatory pre-push publication gate

Before publishing any ref, inspect the staged diff, working tree, all local refs/reachable commits, CI configuration, Dockerfiles, generated frontend output, and runtime configuration. Run Gitleaks over history and current files with `--redact=100`; record no secret values. The candidate branch must not track `.env`, `.qodo/`, `documentation/`, archives, real credentials, private keys, credential-bearing URLs, private host details, or hardcoded secret fallbacks.

`.env.example` is documentation only and contains deliberately non-working placeholders. Required values are injected at runtime from protected environment/files or CI secret storage and must be rejected when absent or malformed. A Gitleaks/manual-review finding stops publication: revoke and rotate the affected value, remove it from all reachable history through an approved rewrite, rerun the full gate, and obtain explicit authorization before a force-push. Never include a discovered value in logs, tickets, reports, or command output.

### Latest local gate record

- Reviewed reachable commits: `abc4b31d4e94d9e7b09f8aea5456dc50390385db`, `16993e6960cf922f0e61b752b4fe7375ab09d3d8`, and `653a6801a60ab604811ab0942dfe05f5f20080ba`.
- Gitleaks: redacted history scan inspected 3 commits; redacted current-tree scan found no leaks.
- Manual review: no CI workflow exists yet; the only Dockerfile uses a digest-pinned base image and non-root runtime user; the generated web artifact is a scaffold without browser configuration.
- Publication status: pending. No remote was added and no push was attempted.
