import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repository = process.cwd();
const backupScript = path.join(repository, "deploy/backup/one-shot-preservation-backup.sh");
const restoreScript = path.join(repository, "deploy/backup/restore-rehearsal.sh");

async function createCommand(directory: string, name: string, body: string) {
  const filename = path.join(directory, name);
  await writeFile(filename, `#!/bin/sh\nset -eu\n${body}\n`, "utf8");
  await chmod(filename, 0o755);
}

async function createMockTools(directory: string) {
  const log = path.join(directory, "calls.log");
  await createCommand(directory, "pg_dump", 'printf "dump"');
  await createCommand(directory, "age", 'printf "age\\n" >> "$MOCK_CALL_LOG"; case "$1" in --recipient) cp "$5" "$4" ;; --decrypt) cp "$6" "$5" ;; *) exit 1 ;; esac');
  await createCommand(directory, "rclone", 'printf "%s\\n" "$*" >> "$MOCK_CALL_LOG"');
  await createCommand(directory, "createdb", 'printf "createdb\\n" >> "$MOCK_CALL_LOG"');
  await createCommand(directory, "pg_restore", 'printf "%s\\n" "$*" >> "$MOCK_CALL_LOG"');
  await createCommand(directory, "dropdb", 'printf "%s\\n" "$*" >> "$MOCK_CALL_LOG"');
  return log;
}

async function createRestoreArtifacts(directory: string) {
  const archive = path.join(directory, "recovery.dump.age");
  const manifest = path.join(directory, "recovery.dump.age.manifest");
  const identity = path.join(directory, "identity");
  const encrypted = "test-encrypted-archive";
  await writeFile(archive, encrypted, "utf8");
  await writeFile(identity, "test-identity", "utf8");
  await writeFile(
    manifest,
    `archive_sha256=${createHash("sha256").update(encrypted).digest("hex")}\narchive_bytes=${Buffer.byteLength(encrypted)}\n`,
    "utf8",
  );
  await chmod(archive, 0o600);
  await chmod(manifest, 0o600);
  await chmod(identity, 0o600);
  return { archive, manifest, identity };
}

function run(script: string, environment: Record<string, string>) {
  return spawnSync("/bin/sh", [script], {
    cwd: repository,
    encoding: "utf8",
    env: { ...environment, PATH: `${environment.PATH ?? ""}:${process.env.PATH ?? ""}` } as unknown as NodeJS.ProcessEnv,
  });
}

test("one-shot preservation backup blocks before invoking tools without explicit confirmation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "one-shot-backup-"));
  try {
    const log = await createMockTools(directory);
    const result = run(backupScript, {
      PATH: directory,
      MOCK_CALL_LOG: log,
      BACKUP_ONESHOT_EXECUTION: "server-only",
    });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "BACKUP_STATUS=BLOCKED_CONFIRMATION\n");
    assert.equal(result.stderr, "");
    await assert.rejects(() => readFile(log, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("one-shot preservation backup creates an immutable verified archive and manifest without retention deletion", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "one-shot-backup-"));
  const output = path.join(directory, "artifacts");
  try {
    const log = await createMockTools(directory);
    const result = run(backupScript, {
      PATH: directory,
      MOCK_CALL_LOG: log,
      BACKUP_ONESHOT_EXECUTION: "server-only",
      BACKUP_ONESHOT_CONFIRMED: "preserve-database",
      BACKUP_AGE_RECIPIENT: "test-recipient",
      COS_BUCKET: "test-bucket",
      COS_REGION: "test-region",
      COS_ENDPOINT: "https://example.invalid",
      COS_ACCESS_KEY_ID: "test-id",
      COS_SECRET_ACCESS_KEY: "test-secret",
      BACKUP_OUTPUT_DIR: output,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^BACKUP_STATUS=VERIFIED_UPLOAD bytes=4 sha256_prefix=[a-f0-9]{12}\n$/u);
    assert.equal(result.stderr, "");
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /test-bucket|test-recipient|test-secret|example\.invalid/u);
    const calls = await readFile(log, "utf8");
    assert.match(calls, /^copyto --immutable /mu);
    assert.match(calls, /^check /mu);
    assert.doesNotMatch(calls, /\bdelete\b|--min-age/u);
    const artifacts = await readdir(output);
    assert.equal(artifacts.filter((name) => name.endsWith(".dump.age")).length, 1);
    assert.equal(artifacts.filter((name) => name.endsWith(".manifest")).length, 1);
    const manifest = await readFile(path.join(output, artifacts.find((name) => name.endsWith(".manifest"))!), "utf8");
    assert.match(manifest, /^archive_sha256=[a-f0-9]{64}$/mu);
    assert.match(manifest, /^archive_bytes=4$/mu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("one-shot preservation backup keeps encrypted evidence and never claims upload when immutable upload fails", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "one-shot-backup-"));
  const output = path.join(directory, "artifacts");
  try {
    const log = await createMockTools(directory);
    await createCommand(directory, "rclone", 'printf "%s\\n" "$*" >> "$MOCK_CALL_LOG"; exit 1');
    const result = run(backupScript, {
      PATH: directory,
      MOCK_CALL_LOG: log,
      BACKUP_ONESHOT_EXECUTION: "server-only",
      BACKUP_ONESHOT_CONFIRMED: "preserve-database",
      BACKUP_AGE_RECIPIENT: "test-recipient",
      COS_BUCKET: "test-bucket",
      COS_REGION: "test-region",
      COS_ENDPOINT: "https://example.invalid",
      COS_ACCESS_KEY_ID: "test-id",
      COS_SECRET_ACCESS_KEY: "test-secret",
      BACKUP_OUTPUT_DIR: output,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "BACKUP_STATUS=FAILED_UPLOAD\n");
    assert.equal(result.stderr, "");
    const artifacts = await readdir(output);
    assert.equal(artifacts.filter((name) => name.endsWith(".dump.age")).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("restore rehearsal rejects a non-test target before decrypting or restoring", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "restore-rehearsal-"));
  try {
    const log = await createMockTools(directory);
    const result = run(restoreScript, {
      PATH: directory,
      MOCK_CALL_LOG: log,
      RESTORE_REHEARSAL_EXECUTION: "ops-only",
      RESTORE_REHEARSAL_CONFIRMED: "restore-isolated-test",
      RESTORE_REHEARSAL_TEST_DATABASE_URL: "postgresql://127.0.0.1/not_a_test_database",
      RESTORE_REHEARSAL_TEST_DATABASE_NAME: "not_a_test_database",
      RESTORE_REHEARSAL_ARCHIVE: path.join(directory, "missing.age"),
      RESTORE_REHEARSAL_MANIFEST: path.join(directory, "missing.manifest"),
      RESTORE_REHEARSAL_AGE_IDENTITY_FILE: path.join(directory, "identity"),
    });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "RESTORE_STATUS=BLOCKED_TARGET\n");
    assert.equal(result.stderr, "");
    await assert.rejects(() => readFile(log, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("restore rehearsal rejects every URI override before decrypting or touching PostgreSQL", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "restore-uri-boundary-"));
  try {
    const log = await createMockTools(directory);
    const artifacts = await createRestoreArtifacts(directory);
    const unsafeUrls = [
      "postgresql://127.0.0.1/recovery_test?host=database.example.invalid",
      "postgresql://127.0.0.1/recovery_test?hostaddr=198.51.100.10",
      "postgresql://127.0.0.1/recovery_test?dbname=other_test",
      "postgresql://127.0.0.1/recovery_test?port=6543",
      "postgresql://127.0.0.1/recovery%5ftest",
      "postgresql://127.0.0.1/recovery_test#fragment",
      "postgresql://operator@127.0.0.1/recovery_test",
      "postgresql://localhost/recovery_test",
      "postgresql://[::1]/recovery_test",
      "postgresql://127.0.0.1:5432/recovery_test",
    ];
    for (const databaseUrl of unsafeUrls) {
      const result = run(restoreScript, {
        PATH: directory,
        MOCK_CALL_LOG: log,
        RESTORE_REHEARSAL_EXECUTION: "ops-only",
        RESTORE_REHEARSAL_CONFIRMED: "restore-isolated-test",
        RESTORE_REHEARSAL_TEST_DATABASE_URL: databaseUrl,
        RESTORE_REHEARSAL_ARCHIVE: artifacts.archive,
        RESTORE_REHEARSAL_MANIFEST: artifacts.manifest,
        RESTORE_REHEARSAL_AGE_IDENTITY_FILE: artifacts.identity,
      });
      assert.equal(result.status, 2);
      assert.equal(result.stdout, "RESTORE_STATUS=BLOCKED_TARGET\n");
      assert.equal(result.stderr, "");
    }
    await assert.rejects(() => readFile(log, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("restore rehearsal generates and cleans up a disposable local-only target", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "restore-uri-boundary-"));
  try {
    const log = await createMockTools(directory);
    const artifacts = await createRestoreArtifacts(directory);
    const result = run(restoreScript, {
      PATH: directory,
      MOCK_CALL_LOG: log,
      RESTORE_REHEARSAL_EXECUTION: "ops-only",
      RESTORE_REHEARSAL_CONFIRMED: "restore-isolated-test",
      RESTORE_REHEARSAL_ARCHIVE: artifacts.archive,
      RESTORE_REHEARSAL_MANIFEST: artifacts.manifest,
      RESTORE_REHEARSAL_AGE_IDENTITY_FILE: artifacts.identity,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^RESTORE_STATUS=VERIFIED_REHEARSAL bytes=22 sha256_prefix=[a-f0-9]{12}\n$/u);
    assert.equal(result.stderr, "");
    const calls = await readFile(log, "utf8");
    assert.match(calls, /^age\ncreatedb\n/mu);
    assert.match(calls, /^--no-owner --no-acl --dbname=postgresql:\/\/127\.0\.0\.1\/restore_rehearsal_[a-f0-9]{32}_test \/tmp\/restore-rehearsal\.[A-Za-z0-9]+\/plain\.dump$/mu);
    assert.match(calls, /^--if-exists --force --maintenance-db=postgresql:\/\/127\.0\.0\.1\/postgres restore_rehearsal_[a-f0-9]{32}_test$/mu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
