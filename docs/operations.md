# Operations Runbook

**Status:** Planned commands and checks. Complete host-specific paths, user, domain and validated recovery steps during Task 12. Do not run recovery commands on an active host without checking the current route and backup first.

## Routine release verification

```bash
systemctl status devdeploy-worker --no-pager
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
curl -fsS https://demo.example.com/health
curl -fsS https://demo.example.com/version
```

Compare `/version.commitSha` to the dashboard's **active release**, not merely the most recent queued attempt. Record deployment ID, CI run, image digest, route slot, and check time.

## Failure triage

1. Check public `/health` and `/version`, then the dashboard attempt timeline.
2. Inspect worker service, app containers, Traefik route file and related journal entries. Never paste secrets into tickets or logs.
3. If the candidate failed before the switch, confirm the previous public version still serves HTTP 200.
4. If the switch failed, compare actual route to the last successful release. Follow the tested manual route restoration procedure and verify public version **before** marking recovery complete.
5. If the worker crashed, run the documented reconciliation process before queueing another attempt.

## Credential rotation

Rotate an admin password through the implemented protected procedure. To rotate a CI credential: create a new project-scoped token, update the protected GitHub environment secret, verify one authenticated release notification, then revoke the old token. Record only credential IDs and timestamps.

## Host recovery

Restore Ubuntu/Docker, platform PostgreSQL, saved Compose/Traefik configuration and GHCR read access; run reconciliation; verify TLS and public version. Repoint DNS only if recovering onto a replacement host. This is manual recovery, not automatic failover.

**Complete during implementation:** actual service name, configuration paths/permissions, expected health output, image/slot retention commands, log retention and route restore drill with elapsed time.
