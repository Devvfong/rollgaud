# RollGaud backup and restore

## Backup contents and storage

`devdeploy-backup.service` runs daily at 02:15 UTC through its persistent systemd timer. It uses `pg_dump` with `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, and `PGPASSWORD` supplied by `/etc/devdeploy/backup.env`; no password is placed in an argument, repository file, unit command, or log. The service writes to a separate protected backup filesystem mounted at `/var/backups/devdeploy`, owned by `devdeploy-backup:devdeploy-backup` with mode `0700`.

Each backup contains:

- a custom-format PostgreSQL dump;
- `SHA256SUMS` covering the dump and configuration archive;
- a snapshot of the platform/project Compose templates and Traefik static/dynamic configuration; and
- owner-only metadata recording creation and verification status.

Successful backup directories and files are mode `0700`/`0600`. `ACTIVE` identifies the last verified backup. Sunday runs also receive a weekly copy. Retention keeps seven verified daily backups and four verified weekly backups. The guarded pruning command skips `ACTIVE`, failed/unfinished backups, and any backup whose checksum verification does not pass. Separate storage should be backed up or replicated outside the host; the local copy is not the disaster-recovery copy.

## Installation and verification

Create the dedicated non-login `devdeploy-backup` user, group, protected environment file, and mount before enabling the unit:

```text
install -d -o devdeploy-backup -g devdeploy-backup -m 0700 /var/backups/devdeploy
install -o root -g root -m 0600 /etc/devdeploy/backup.env
systemctl daemon-reload
systemctl enable --now devdeploy-backup.timer
systemctl list-timers devdeploy-backup.timer
```

Run `systemctl start devdeploy-backup.service` during a maintenance window, then inspect only the exit status and protected backup metadata. `scripts/verify-backup.sh /var/backups/devdeploy/daily/<id>` checks owner-only permissions, checksums, archive traversal safety, and verified status without printing secrets.

## Isolated restore drill

1. Stop or isolate consumers of the target database and create a new empty PostgreSQL database on a disposable host or isolated namespace. Supply its password as `TARGET_PGPASSWORD` through protected environment, never in the command line.
2. Run `scripts/restore-platform.sh --backup /var/backups/devdeploy/daily/<id> --target postgresql://<user>@<isolated-host>:<port>/<new-database> --isolated`.
3. The script rejects empty, shell-shaped, credential-bearing, or non-isolated targets, verifies the backup first, rejects a non-empty isolated database, and never changes the current platform database silently. A live target additionally requires both `--live` and `--confirm-live`; use this only with a separately approved change window.
4. Compare schema/table counts and representative project, release, deployment, and event rows. Measure elapsed restore time and retain the evidence with the backup record.
5. Before serving traffic, run worker `reconcileOnStartup()`, compare the restored database with Docker slots and the worker-owned Traefik route, and verify the public `/health` and `/version` responses. Do not mark a deployment successful from database rows alone.

## Manual host and DNS recovery

If the host is lost, provision a clean isolated host, restore PostgreSQL and the protected Compose/Traefik snapshot, recreate ownership and permissions, install the worker and backup units, then run worker reconciliation before enabling traffic. Restore DNS and TLS only after the public route serves the expected known-good commit SHA. If the previous image is unavailable, preserve the current route and escalate; never delete the last known-good backup or image while recovering.

**Evidence status:** the repository test harness and disposable local PostgreSQL restore are covered in `docs/progress.md`; live off-host replication, systemd execution, host journal access, DNS, and HTTPS recovery remain pending because no production or authorized disposable host is configured.
