import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repository = process.cwd();
const backupScript = path.join(repository, "deploy/backup/one-shot-preservation-backup.sh");
const restoreScript = path.join(repository, "deploy/backup/restore-rehearsal.sh");

async function command(directory: string, name: string, body: string) {
  const filename = path.join(directory, name);
  await writeFile(filename, `#!/bin/sh\nset -eu\n${body}\n`, "utf8");
  await chmod(filename, 0o755);
}

async function tools(directory: string) {
  const log = path.join(directory, "calls.log");
  await command(directory, "pg_dump", 'printf "dump"');
  await command(directory, "rclone", [
    'printf "rclone\\n" >> "$MOCK_CALL_LOG"',
    'if [ -n "${MOCK_SIGNAL:-}" ] && [ ! -f "$MOCK_INTERRUPT_MARKER" ]; then : > "$MOCK_INTERRUPT_MARKER"; kill "-$MOCK_SIGNAL" "$PRESERVATION_SCRIPT_PID"; fi',
  ].join("\n"));
  await command(directory, "age", [
    'printf "age\\n" >> "$MOCK_CALL_LOG"',
    'case "$1" in',
    '  --recipient) cp "$5" "$4" ;;',
    '  --decrypt)',
    '    if [ -n "${MOCK_ORIGINAL_ARCHIVE:-}" ]; then',
    '      if [ "$6" = "$MOCK_ORIGINAL_ARCHIVE" ]; then printf "direct_source\\n" >> "$MOCK_CALL_LOG"; else printf "snapshot_source\\n" >> "$MOCK_CALL_LOG"; fi',
    '      printf "%s" "mutated-after-check" > "$MOCK_ORIGINAL_ARCHIVE"',
    '    fi',
    '    cp "$6" "$5" ;;',
    '  *) exit 1 ;;',
    'esac',
  ].join("\n"));
  await command(directory, "createdb", 'printf "createdb\\n" >> "$MOCK_CALL_LOG"');
  await command(directory, "pg_restore", [
    'printf "pg_restore\\n" >> "$MOCK_CALL_LOG"',
    'if [ -n "${MOCK_SIGNAL:-}" ] && [ ! -f "$MOCK_INTERRUPT_MARKER" ]; then : > "$MOCK_INTERRUPT_MARKER"; kill "-$MOCK_SIGNAL" "$PRESERVATION_SCRIPT_PID"; fi',
    'if [ -n "${MOCK_EXPECT_PLAIN_CONTENT:-}" ]; then test "$(cat "$4")" = "$MOCK_EXPECT_PLAIN_CONTENT"; fi',
  ].join("\n"));
  await command(directory, "dropdb", 'printf "dropdb\\n" >> "$MOCK_CALL_LOG"');
  return log;
}

async function artifacts(directory: string) {
  const archive = path.join(directory, "recovery.dump.age");
  const manifest = path.join(directory, "recovery.dump.age.manifest");
  const identity = path.join(directory, "identity");
  const encrypted = "original-encrypted-archive";
  await writeFile(archive, encrypted, "utf8");
  await writeFile(identity, "test-identity", "utf8");
  await writeFile(manifest, `archive_sha256=${createHash("sha256").update(encrypted).digest("hex")}\narchive_bytes=${Buffer.byteLength(encrypted)}\n`, "utf8");
  await chmod(archive, 0o600);
  await chmod(manifest, 0o600);
  await chmod(identity, 0o600);
  return { archive, manifest, identity, encrypted };
}

function run(script: string, environment: Record<string, string>) {
  return spawnSync("/bin/sh", [script], {
    cwd: repository,
    encoding: "utf8",
    env: { ...environment, PATH: `${environment.PATH ?? ""}:${process.env.PATH ?? ""}` } as unknown as NodeJS.ProcessEnv,
  });
}

function runAsync(script: string, environment: Record<string, string>) {
  const child = spawn("/bin/sh", [script], {
    cwd: repository,
    env: { ...environment, PATH: `${environment.PATH ?? ""}:${process.env.PATH ?? ""}` } as unknown as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return {
    child,
    result: new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    }),
  };
}

async function waitForFile(filename: string) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      await lstat(filename);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error("test fixture did not become ready");
}

function backupEnvironment(directory: string, log: string, signal: string) {
  return {
    PATH: directory, MOCK_CALL_LOG: log, MOCK_SIGNAL: signal, MOCK_INTERRUPT_MARKER: path.join(directory, "interrupt"),
    BACKUP_ONESHOT_EXECUTION: "server-only", BACKUP_ONESHOT_CONFIRMED: "preserve-database",
    BACKUP_AGE_RECIPIENT: "fixture-recipient", COS_BUCKET: "fixture-bucket", COS_REGION: "fixture-region",
    COS_ENDPOINT: "https://fixture.invalid", COS_ACCESS_KEY_ID: "fixture-id", COS_SECRET_ACCESS_KEY: "fixture-secret",
    BACKUP_OUTPUT_DIR: path.join(directory, "out"),
  };
}

function restoreEnvironment(directory: string, log: string, source: Awaited<ReturnType<typeof artifacts>>, extra: Record<string, string> = {}) {
  return {
    PATH: directory, MOCK_CALL_LOG: log, MOCK_INTERRUPT_MARKER: path.join(directory, "interrupt"),
    RESTORE_REHEARSAL_EXECUTION: "ops-only", RESTORE_REHEARSAL_CONFIRMED: "restore-isolated-test",
    RESTORE_REHEARSAL_ARCHIVE: source.archive, RESTORE_REHEARSAL_MANIFEST: source.manifest,
    RESTORE_REHEARSAL_AGE_IDENTITY_FILE: source.identity, ...extra,
  };
}

for (const signal of ["TERM", "INT", "HUP"]) {
  test(`backup stops after ${signal} during its first rclone call`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "one-shot-signal-"));
    try {
      const log = await tools(directory);
      const result = run(backupScript, backupEnvironment(directory, log, signal));
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "BACKUP_STATUS=INTERRUPTED\n");
      assert.equal(result.stderr, "");
      assert.doesNotMatch(result.stdout, /VERIFIED_UPLOAD/u);
      assert.equal((await readFile(log, "utf8")).match(/^rclone$/gmu)?.length, 1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

for (const signal of ["TERM", "INT", "HUP"]) {
  test(`restore stops and attempts only test-database cleanup after ${signal} in pg_restore`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "restore-signal-"));
    try {
      const log = await tools(directory);
      const source = await artifacts(directory);
      const plainPathFile = path.join(directory, "plain-path");
      await command(directory, "pg_restore", [
        'printf "pg_restore\\n" >> "$MOCK_CALL_LOG"',
        'printf "%s" "$4" > "$MOCK_PLAIN_PATH_FILE"',
        ': > "$MOCK_INTERRUPT_MARKER"; kill "-$MOCK_SIGNAL" "$PRESERVATION_SCRIPT_PID"',
      ].join("\n"));
      const result = run(restoreScript, restoreEnvironment(directory, log, source, {
        MOCK_SIGNAL: signal, MOCK_PLAIN_PATH_FILE: plainPathFile,
      }));
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "RESTORE_STATUS=INTERRUPTED\n");
      assert.equal(result.stderr, "");
      const calls = await readFile(log, "utf8");
      assert.deepEqual(calls.trim().split("\n"), ["age", "createdb", "pg_restore", "dropdb"]);
      const plainPath = await readFile(plainPathFile, "utf8");
      await assert.rejects(() => lstat(plainPath));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("restore rejects symlink, non-regular artifact, and unsafe parent before every external restore command", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "restore-artifact-boundary-"));
  try {
    const cases = ["archive symlink", "manifest symlink", "identity symlink", "archive directory", "archive fifo", "world writable parent"];
    for (const entry of cases) {
      const caseDirectory = await mkdtemp(path.join(os.tmpdir(), "restore-artifact-case-"));
      const caseLog = await tools(caseDirectory);
      const caseSource = await artifacts(caseDirectory);
      if (entry === "archive symlink") { await rm(caseSource.archive); await symlink(caseSource.manifest, caseSource.archive); }
      if (entry === "manifest symlink") { await rm(caseSource.manifest); await symlink(caseSource.archive, caseSource.manifest); }
      if (entry === "identity symlink") { await rm(caseSource.identity); await symlink(caseSource.archive, caseSource.identity); }
      if (entry === "archive directory") { await rm(caseSource.archive); await mkdir(caseSource.archive); }
      if (entry === "archive fifo") { await rm(caseSource.archive); assert.equal(spawnSync("mkfifo", [caseSource.archive]).status, 0); }
      if (entry === "world writable parent") { await chmod(caseDirectory, 0o777); }
      const result = run(restoreScript, restoreEnvironment(caseDirectory, caseLog, caseSource));
      assert.equal(result.status, 2, entry);
      assert.equal(result.stdout, "RESTORE_STATUS=BLOCKED_ARTIFACT\n", entry);
      await assert.rejects(() => readFile(caseLog, "utf8"));
      await chmod(caseDirectory, 0o700);
      await rm(caseDirectory, { recursive: true, force: true });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("restore validates and decrypts only a private snapshot after the original archive is replaced", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "restore-snapshot-"));
  try {
    const log = await tools(directory);
    const source = await artifacts(directory);
    const result = run(restoreScript, restoreEnvironment(directory, log, source, {
      MOCK_ORIGINAL_ARCHIVE: source.archive,
      MOCK_EXPECT_PLAIN_CONTENT: source.encrypted,
    }));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^RESTORE_STATUS=VERIFIED_REHEARSAL /u);
    const calls = await readFile(log, "utf8");
    assert.match(calls, /snapshot_source/u);
    assert.doesNotMatch(calls, /direct_source/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("backup interrupts its active rclone child before the child can continue side effects", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "one-shot-active-child-"));
  try {
    const log = await tools(directory);
    await command(directory, "rclone", [
      'printf "rclone_start\\n" >> "$MOCK_CALL_LOG"',
      ': > "$MOCK_INTERRUPT_MARKER"; kill -TERM "$PRESERVATION_SCRIPT_PID"',
      'sleep 3',
      'printf "rclone_late_effect\\n" >> "$MOCK_CALL_LOG"',
    ].join("\n"));
    const startedAt = Date.now();
    const result = run(backupScript, backupEnvironment(directory, log, "TERM"));
    const elapsedMs = Date.now() - startedAt;
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "BACKUP_STATUS=INTERRUPTED\n");
    assert.ok(elapsedMs < 7_000, `expected bounded stop, got ${elapsedMs}ms`);
    assert.doesNotMatch(await readFile(log, "utf8"), /rclone_late_effect/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("restore cleans only its generated temporary database when createdb is interrupted before returning", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "restore-createdb-interrupt-"));
  try {
    const log = await tools(directory);
    const source = await artifacts(directory);
    await command(directory, "createdb", [
      'printf "createdb:%s\\n" "$2" >> "$MOCK_CALL_LOG"',
      ': > "$MOCK_INTERRUPT_MARKER"; kill -TERM "$PRESERVATION_SCRIPT_PID"',
      'sleep 3',
      'printf "createdb_late_effect\\n" >> "$MOCK_CALL_LOG"',
    ].join("\n"));
    await command(directory, "dropdb", 'printf "dropdb:%s\\n" "$4" >> "$MOCK_CALL_LOG"');
    const startedAt = Date.now();
    const result = run(restoreScript, restoreEnvironment(directory, log, source));
    const elapsedMs = Date.now() - startedAt;
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "RESTORE_STATUS=INTERRUPTED\n");
    assert.ok(elapsedMs < 7_000, `expected bounded stop, got ${elapsedMs}ms`);
    const calls = (await readFile(log, "utf8")).trim().split("\n");
    assert.equal(calls[0], "age");
    assert.match(calls[1]!, /^createdb:restore_rehearsal_[a-f0-9]{32}_test$/u);
    assert.equal(calls[2], calls[1]!.replace("createdb:", "dropdb:"));
    assert.doesNotMatch(calls.join("\n"), /createdb_late_effect/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("backup signal terminates only its isolated child process group", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "one-shot-process-scope-"));
  const sentinel = spawn("/bin/sh", ["-c", "exec sleep 30"], { stdio: "ignore" });
  try {
    await once(sentinel, "spawn");
    const log = await tools(directory);
    await command(directory, "rclone", [
      'printf "rclone_start\\n" >> "$MOCK_CALL_LOG"',
      ': > "$MOCK_INTERRUPT_MARKER"; kill -TERM "$PRESERVATION_SCRIPT_PID"',
      'sleep 3',
      'printf "rclone_late_effect\\n" >> "$MOCK_CALL_LOG"',
    ].join("\n"));
    const result = run(backupScript, backupEnvironment(directory, log, "TERM"));
    assert.notEqual(result.status, 0);
    assert.equal(sentinel.exitCode, null);
    assert.doesNotThrow(() => process.kill(sentinel.pid!, 0));
  } finally {
    if (sentinel.exitCode === null) {
      sentinel.kill("SIGKILL");
      await once(sentinel, "exit");
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("backup kills a child that ignores the requested termination signal within a bounded grace", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "one-shot-stubborn-child-"));
  try {
    const log = await tools(directory);
    await command(directory, "rclone", [
      'printf "rclone_start\\n" >> "$MOCK_CALL_LOG"',
      "trap '' TERM INT HUP",
      ': > "$MOCK_INTERRUPT_MARKER"; kill -TERM "$PRESERVATION_SCRIPT_PID"',
      'while :; do sleep 1; done',
    ].join("\n"));
    const startedAt = Date.now();
    const result = run(backupScript, backupEnvironment(directory, log, "TERM"));
    const elapsedMs = Date.now() - startedAt;
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "BACKUP_STATUS=INTERRUPTED\n");
    assert.ok(elapsedMs < 7_000, `expected bounded forced stop, got ${elapsedMs}ms`);
    assert.deepEqual((await readFile(log, "utf8")).trim().split("\n"), ["age", "rclone_start"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("backup waits for the whole tracked process group after its leader exits", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "one-shot-group-descendant-"));
  const descendantPidFile = path.join(directory, "descendant-pid");
  const lateMarker = path.join(directory, "late-marker");
  const readyMarker = path.join(directory, "descendant-ready");
  try {
    const log = await tools(directory);
    await command(directory, "rclone", [
      'printf "rclone_leader\\n" >> "$MOCK_CALL_LOG"',
      '( trap "" TERM INT HUP; : > "$MOCK_READY_MARKER"; sleep 3; : > "$MOCK_LATE_MARKER"; sleep 30 ) &',
      'printf "%s" "$!" > "$MOCK_DESCENDANT_PID_FILE"',
      'while [ ! -f "$MOCK_READY_MARKER" ]; do sleep 0.01; done',
      'sleep 30',
    ].join("\n"));
    const execution = runAsync(backupScript, {
      ...backupEnvironment(directory, log, "TERM"),
      MOCK_DESCENDANT_PID_FILE: descendantPidFile,
      MOCK_LATE_MARKER: lateMarker,
      MOCK_READY_MARKER: readyMarker,
    });
    await waitForFile(readyMarker);
    execution.child.kill("SIGTERM");
    const result = await execution.result;
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "BACKUP_STATUS=INTERRUPTED\n");
    await new Promise((resolve) => setTimeout(resolve, 3_300));
    await assert.rejects(() => lstat(lateMarker));
    const descendantPid = Number(await readFile(descendantPidFile, "utf8"));
    assert.throws(() => process.kill(descendantPid, 0));
  } finally {
    try {
      const descendantPid = Number(await readFile(descendantPidFile, "utf8"));
      if (Number.isInteger(descendantPid)) process.kill(descendantPid, "SIGKILL");
    } catch {}
    await rm(directory, { recursive: true, force: true });
  }
});

test("restore terminates createdb helpers before dropping its generated test database", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "restore-createdb-group-"));
  const lateMarker = path.join(directory, "late-createdb-marker");
  const readyMarker = path.join(directory, "late-createdb-ready");
  try {
    const log = await tools(directory);
    const source = await artifacts(directory);
    await command(directory, "createdb", [
      'printf "createdb_leader:%s\\n" "$2" >> "$MOCK_CALL_LOG"',
      '( trap "" TERM INT HUP; : > "$MOCK_READY_MARKER"; sleep 3; : > "$MOCK_LATE_MARKER"; printf "createdb_late\\n" >> "$MOCK_CALL_LOG"; sleep 30 ) &',
      'while [ ! -f "$MOCK_READY_MARKER" ]; do sleep 0.01; done',
      'sleep 30',
    ].join("\n"));
    await command(directory, "dropdb", 'printf "dropdb:%s\\n" "$4" >> "$MOCK_CALL_LOG"');
    const execution = runAsync(restoreScript, restoreEnvironment(directory, log, source, {
      MOCK_LATE_MARKER: lateMarker,
      MOCK_READY_MARKER: readyMarker,
    }));
    await waitForFile(readyMarker);
    execution.child.kill("SIGTERM");
    const result = await execution.result;
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "RESTORE_STATUS=INTERRUPTED\n");
    await new Promise((resolve) => setTimeout(resolve, 3_300));
    await assert.rejects(() => lstat(lateMarker));
    const calls = (await readFile(log, "utf8")).trim().split("\n");
    assert.match(calls[1]!, /^createdb_leader:restore_rehearsal_[a-f0-9]{32}_test$/u);
    assert.equal(calls[2], calls[1]!.replace("createdb_leader:", "dropdb:"));
    assert.doesNotMatch(calls.join("\n"), /createdb_late/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
