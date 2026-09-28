# Backup and Restore

**Status:** Procedure design. A backup is unverified until restored into a separate database and checked against known records.

## Scope and policy

- Back up **platform PostgreSQL**, Compose/Traefik configuration and worker templates. The stateless example application's external data is not covered.
- Schedule one daily dump with checksum and restricted file permissions. Retain seven daily and four weekly copies on protected storage; record actual storage path and encryption choice after provisioning.
- Never embed DB passwords in commands, logs or backup filenames. Prevent pruning the newest valid backup if the latest dump failed.

## Restore drill

1. Record source backup name, checksum, creation time and test database target.
2. Restore to a **new isolated database**, not the live database.
3. Verify schema version, project count, deployment count, current release relationships and sample known event.
4. Record restore elapsed time and failures. Tear down the isolated test environment after retaining redacted evidence.
5. For a real host recovery, reconcile restored DB state with Traefik route and running containers before enabling new deploys.

**Evidence table:**

| Backup timestamp | Checksum verified | Isolated restore date | Rows/relations verified | Duration | Result |
| --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | Pending | Pending | Pending |
