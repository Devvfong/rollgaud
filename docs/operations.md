# DevDeploy host operations

This runbook describes the intended single-host installation. It contains no live hostname, credential, certificate, or private host address. Values in Compose and the worker environment file are supplied at runtime.

## Ownership and permissions

Create a dedicated non-login `devdeploy-worker` user and group. The worker is the only non-root service identity granted the `docker` group, because Docker socket access is equivalent to host root. The worker owns `/var/lib/devdeploy/routes` and `/var/lib/devdeploy/compose` with mode `0750`; generated route and Compose files are mode `0640` or stricter. Traefik reads the route directory read-only. The API, web service, Traefik, Alloy, PostgreSQL, Prometheus, and Loki never receive the Docker socket.

The unit uses `ProtectSystem=strict`, `ProtectHome=true`, `NoNewPrivileges=true`, a private temporary directory, and explicit write paths. It runs without a login shell and restarts after a failure. Review Docker group membership and route-directory ownership after every host change.

## Runtime secrets and configuration

Create `/etc/devdeploy/worker.env` and protect it with root ownership and mode `0600`. Supply the database URL, validated GitHub repository/workflow/read token, GHCR pull credentials, and any host-specific paths through protected environment or secret files. Do not commit this file. Compose requires `DATABASE_URL`, `POSTGRES_PASSWORD`, `GITHUB_REPOSITORY`, `GHCR_IMAGE_NAMESPACE`, `GITHUB_WORKFLOW_PATH`, and `GITHUB_READ_TOKEN` at runtime; missing values fail closed. Never place these values in an image, frontend variable, command line, route file, event message, or log.

## DNS, TLS, and firewall

Point the chosen public DNS records to the authorized host only after an approved maintenance window. Configure ACME or supplied certificates in the protected Traefik secret directory; never commit certificates or private keys. Traefik is the only service exposed on TCP 80/443. Use UFW (or the approved host firewall) to allow 22 only from the operator network and 80/443 from the intended clients; deny other inbound traffic and do not expose PostgreSQL, API, metrics, or log storage ports.

## Install and restart

Review the rendered configuration with `docker compose -f infrastructure/compose/compose.platform.yml config`, create the private networks and protected directories, then install the unit with `systemctl enable --now devdeploy-worker.service`. Check `systemctl status` and journal output without copying secrets. Restart the worker after upgrading its code or environment; it must reconcile database attempts, route state, Docker slots, and public version before claiming an expired lease.

## Emergency route restoration

Stop the worker before emergency intervention. Preserve the current route file, identify the last verified release and digest from the database, and restore a complete known-good route file through an atomic replacement owned by `devdeploy-worker`. Verify `/health` and `/version.commitSha` over the public HTTPS endpoint before restarting the worker. If the old image cannot be pulled, keep the currently serving route intact and escalate; never delete the last known-good image or claim `rolled_back` without public verification. Record the incident and any transient 502 as an availability failure.

## Acceptance smoke and capacity evidence

The local acceptance flow is exercised with `corepack pnpm test:e2e`. On an authorized disposable host, set `SMOKE_ORIGIN`, `SMOKE_PROJECT_ID`, `SMOKE_DB_HOST`, `SMOKE_DB_PORT`, `SMOKE_DB_USER`, `SMOKE_DB_NAME`, and a protected `SMOKE_DB_PASSWORD` environment value, then run `bash scripts/smoke.sh`. The script uses `curl --fail-with-body` for `/health` and `/version`, compares the returned commit SHA with `projects.current_release_id`, and emits only a short SHA prefix. It does not accept credentials in URLs or command-line arguments.

The 20-release and sustained 1 RPS scripts are guarded by `AUTHORIZED_DISPOSABLE_HOST=1`, require a protected curl config, validate UUID/path inputs, and have not been run in this checkout. Never use them against a production host as a substitute for an approved capacity plan. Record elapsed time, errors, host resources, and the exact commit in the evidence matrix; absence of those measurements stays `PENDING`.

After an isolated restore, run the worker startup reconciliation before admitting new work. Confirm the database current release, route file, Docker slots, and public `/version` agree. Keep separate off-host backup storage and retain the manual DNS/TLS and emergency route-restoration steps above; a local mock or disposable database cannot prove host recovery.
