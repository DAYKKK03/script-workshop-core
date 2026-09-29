# One-Shot Preservation Backup and Restore Rehearsal

## Purpose

These ops-only commands prepare a future cloud-shutdown preservation backup. They are disabled by default and are not a scheduled backup replacement. This repository phase did not execute either command against a database, age recipient, COS bucket, or server runtime.

## One-shot backup contract

`deploy/backup/one-shot-preservation-backup.sh` runs only when both exact, server-side gates are present:

- `BACKUP_ONESHOT_EXECUTION=server-only`
- `BACKUP_ONESHOT_CONFIRMED=preserve-database`

It also requires the existing database, age, and COS runtime configuration plus an absolute, controlled `BACKUP_OUTPUT_DIR`. Missing data returns a fixed blocked status without naming the missing variable or invoking a command.

The command takes one PostgreSQL custom dump, encrypts it with age, and creates a timestamp-plus-random-nonce archive name. It records only the encrypted artifact's full SHA-256 and byte count in a local manifest. It uploads the encrypted artifact and manifest with `rclone copyto --immutable`, then uses `rclone check` for each upload before reporting success.

Its output is limited to a fixed status, byte count, and twelve-character SHA-256 prefix. It never prints database data, recipient, bucket, object key, endpoint, credential, or command error text.

The command never loops and contains no `rclone delete`, retention, listing, download, or provider action. A failed upload leaves the encrypted local artifact and manifest inside the operator-controlled output directory for manual inspection or approved secure disposal. The normal exit trap only removes the temporary plaintext dump.

`pg_dump`, `age`, and each `rclone` call run in an isolated process group through the host's `/usr/bin/perl` `POSIX::setsid` support. A separate tracker remains outside that group and retains its private PGID record. `HUP`, `INT`, and `TERM` target the negative PGID, then wait for the whole group rather than treating the command's group leader as proof that all descendants stopped. After two seconds the watchdog sends `KILL` to the same negative PGID and the script waits for the external tracker to observe that the group has gone away. This prevents a background child that ignores the first signal from continuing an upload after an operator stop. It does not target the caller shell or unrelated processes. Signal handling removes plaintext, emits only `BACKUP_STATUS=INTERRUPTED`, and exits nonzero before any later upload, check, or verified-upload status can run.

## Restore rehearsal contract

`deploy/backup/restore-rehearsal.sh` never downloads an archive. It only accepts absolute local encrypted archive and manifest paths plus a local age identity file. Each source must be a current-user-owned regular file, not a symbolic link, and its canonical parent directory must not be group- or world-writable. Before any external restore command, the script copies all three inputs with link preservation into a newly created `0700` private snapshot directory, verifies those snapshots are regular files, and uses only the snapshots for manifest parsing, hash verification, and decryption. This closes the check-then-read replacement window on the original paths.

The manifest proves only that the archive snapshot is consistent with the supplied manifest; it is not provenance authentication for an archive or identity file. Operators still need a separately trusted source and offline identity custody.

It requires both:

- `RESTORE_REHEARSAL_EXECUTION=ops-only`
- `RESTORE_REHEARSAL_CONFIRMED=restore-isolated-test`

The caller cannot choose a restore database name or URI: legacy target variables are rejected. The script generates a fresh 128-bit random `restore_rehearsal_<nonce>_test` name and constructs its sole database URI as `postgresql://127.0.0.1/<generated name>`. No user info, port, query, fragment, percent encoding, DNS name, or IPv6 form enters the restore path. This deliberately removes every libpq override mechanism, including `host`, `hostaddr`, `dbname`, and `port` query parameters. It creates that disposable database, restores the dump, and drops it through its fixed loopback maintenance connection.

`age`, `createdb`, and `pg_restore` use the same whole-process-group rule as backup. The script records a creation attempt before starting `createdb`, so a signal after the server may have created the database but before `createdb` returns still invokes one bounded best-effort drop of only that freshly generated name. It first waits for the complete `createdb` process group to end (or kills that group after the two-second grace) before attempting the controlled drop; a helper cannot create the generated database after that cleanup ordering point. Normal exit removes plaintext and the snapshot. Cleanup failure never becomes a success report and must be handled manually; no caller-selected or non-test database is eligible for deletion.

## Why this design

The one-shot path is isolated from the existing daily loop so a preservation operation cannot silently trigger retention deletion. Immutable upload plus a random name avoids replacement of an older archive; the manifest and post-upload checks create a verifiable receipt without logging sensitive storage identifiers.

## Limits and required operator evidence

- `rclone --immutable` and `rclone check` are invoked by the script but their behavior against the real COS account still requires an accepted, controlled runtime rehearsal.
- This tool does not create a cloud-console snapshot, prove bucket versioning/lifecycle behavior, or validate retention policy.
- The age identity must be held offline and separately from cloud credentials.
- A successful restore rehearsal and a cloud-console snapshot are still required before any cloud shutdown decision.
- Local process-group tests verify only mock control flow; they do not prove real backup tools, PostgreSQL, or cloud services share these signal and cleanup semantics.

## Commands

Use only through a controlled server/ops runtime after an explicit approval. Do not paste secret values into a shell history or repository file:

```sh
npm run backup:preservation:oneshot
npm run backup:restore:rehearsal
```

Both commands fail closed without the required gates and runtime configuration.
