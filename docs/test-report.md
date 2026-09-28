# Test and Acceptance Report

**Status:** Pending implementation. The results below are a checklist, not evidence of passing tests.

| Goal | Test evidence to attach | Actual result |
| --- | --- | --- |
| G1 Protected push triggers tests/scans/build/release | GitHub run URL, SHA, matching digest and deployment ID | Pending |
| G2 Failed tests/scans block release | Fake-secret and controlled vulnerability runs | Pending |
| G3 Healthy digest serves over HTTPS | Certificate check and `/version` equals target SHA | Pending |
| G4 Bad release keeps/restores last good | Failed attempt events; prior version HTTP 200 | Pending |
| G5 Manual rollback | New attempt ID, old SHA restored and verified | Pending |
| G6 Incident observable | Grafana metrics, Loki logs, deployment timeline | Pending |
| G7 Platform data recoverable | Backup checksum and isolated DB restore | Pending |

## Additional checks

- API unit/e2e: auth/CSRF, project validation, provenance mismatch, duplicate/out-of-order CI run, concurrent attempt.
- Worker integration: pre-switch failure, public probe mismatch, route restore, crash reconciliation, missing old registry image.
- Frontend browser: login, form errors, same-origin integration, `202` queued status, status polling, rollback confirmation, mobile width and keyboard access.
- Capacity: 20 sequential deployments within a day and 1 request/second for 10 minutes on reference host; record actual resource use and error count.

## Executed commands and results

```text
Pending — include exact command, date, exit code, test count, environment, and redacted output or artifact link after execution.
```

Never change a pending result to pass without executing the corresponding check.
