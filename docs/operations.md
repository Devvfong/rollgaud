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
