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
