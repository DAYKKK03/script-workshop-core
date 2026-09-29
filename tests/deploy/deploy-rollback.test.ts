import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const deployScript = fileURLToPath(
  new URL("../../deploy/deploy.sh", import.meta.url)
);

const fakeDocker = `#!/bin/sh
printf '%s|%s\n' "\${IMAGE_TAG:-unset}" "$*" >> "$DEPLOY_TEST_LOG"
case "$*" in
  "compose up -d --remove-orphans --scale worker=1 --scale topic-worker=1 --scale custom-script-worker=1")
    if [ "$DEPLOY_TEST_SCENARIO" = "startup_failure" ] && [ "\${IMAGE_TAG:-}" = "def456" ]; then
      exit 1
    fi
    ;;
  "compose up -d --force-recreate caddy")
    if [ "$DEPLOY_TEST_SCENARIO" = "caddy_failure" ]; then exit 1; fi
    ;;
  "compose ps --status running -q worker")
    count=0
    if [ -f "$DEPLOY_TEST_WORKER_COUNT" ]; then count="$(cat "$DEPLOY_TEST_WORKER_COUNT")"; fi
    count=$((count + 1))
    printf '%s' "$count" > "$DEPLOY_TEST_WORKER_COUNT"
    if { [ "$DEPLOY_TEST_SCENARIO" = "worker_failure" ] && [ "$count" -eq 1 ]; } || [ "$DEPLOY_TEST_SCENARIO" = "persistent_worker_failure" ]; then
      printf 'worker-one\nworker-two\n'
    else
      printf 'worker-current\n'
    fi
    ;;
  "inspect --format "*)
    if [ "$DEPLOY_TEST_SCENARIO" = "worker_restart" ] && [ "\${IMAGE_TAG:-}" = "def456" ]; then
      inspect_count=0
      if [ -f "$DEPLOY_TEST_INSPECT_COUNT" ]; then inspect_count="$(cat "$DEPLOY_TEST_INSPECT_COUNT")"; fi
      inspect_count=$((inspect_count + 1))
      printf '%s' "$inspect_count" > "$DEPLOY_TEST_INSPECT_COUNT"
      if [ "$inspect_count" -gt 1 ]; then
        printf '%s\n' '2026-08-23T06:01:00Z'
        exit 0
      fi
    fi
    printf '%s\n' '2026-08-23T06:00:00Z'
    ;;
  "logs --since "*)
    if [ "\${IMAGE_TAG:-}" = "abc123" ]; then
      printf '%s\n' '{"event":"douyin_extraction_worker_tick"}'
    elif [ "$DEPLOY_TEST_SCENARIO" != "missing_tick" ] && [ "$DEPLOY_TEST_SCENARIO" != "old_tick" ]; then
      printf '%s\n' '{"event":"douyin_extraction_worker_tick"}'
    fi
    ;;
  "compose ps --status running -q topic-worker")
    printf 'topic-worker-one\n'
    ;;
  "compose ps --status running -q custom-script-worker")
    printf 'custom-script-worker-one\n'
    ;;
  "compose ps --status running -q caddy")
    if [ "$DEPLOY_TEST_SCENARIO" != "caddy_failure" ]; then
      printf 'caddy-one\n'
    fi
    ;;
  "compose exec -T web node -e "*)
    count=0
    if [ -f "$DEPLOY_TEST_WEB_COUNT" ]; then count="$(cat "$DEPLOY_TEST_WEB_COUNT")"; fi
    count=$((count + 1))
    printf '%s' "$count" > "$DEPLOY_TEST_WEB_COUNT"
    if [ "$DEPLOY_TEST_SCENARIO" = "web_failure" ] && [ "$count" -le 20 ]; then
      exit 1
    fi
    ;;
  "compose exec -T topic-worker npm run worker:topics:check")
    if [ "$DEPLOY_TEST_SCENARIO" = "topic_worker_functional_failure" ] && [ "\${IMAGE_TAG:-}" = "def456" ]; then
      exit 1
    fi
    ;;
  "compose exec -T custom-script-worker npm run worker:custom-scripts:check")
    if [ "$DEPLOY_TEST_SCENARIO" = "custom_script_worker_functional_failure" ] && [ "\${IMAGE_TAG:-}" = "def456" ]; then
      exit 1
    fi
    ;;
esac
exit 0
`;

const fakeSleep = `#!/bin/sh
exit 0
`;

const fakeDate = `#!/bin/sh
printf '%s\\n' '2026-08-23T05:00:00Z'
`;

async function runDeployment(
  scenario:
    | "worker_failure"
    | "persistent_worker_failure"
    | "web_failure"
    | "missing_tick"
    | "old_tick"
    | "worker_restart"
    | "busy_queue"
    | "topic_worker_functional_failure"
    | "custom_script_worker_functional_failure"
    | "caddy_failure"
    | "startup_failure"
    | "success",
  previousTag?: string
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "deploy-rollback-"));
  const bin = path.join(directory, "bin");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(bin));
  await writeFile(path.join(bin, "docker"), fakeDocker);
  await writeFile(path.join(bin, "sleep"), fakeSleep);
  await writeFile(path.join(bin, "date"), fakeDate);
  await chmod(path.join(bin, "docker"), 0o755);
  await chmod(path.join(bin, "sleep"), 0o755);
  await chmod(path.join(bin, "date"), 0o755);

  if (previousTag) {
    await writeFile(path.join(directory, ".deployed-image-tag"), previousTag);
  }

  const logFile = path.join(directory, "docker.log");
  const result = spawnSync("/bin/sh", [deployScript, "def456"], {
    cwd: directory,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH || ""}`,
      APP_IMAGE: "registry.invalid/application",
      DEPLOY_TEST_LOG: logFile,
      DEPLOY_TEST_SCENARIO: scenario,
      DEPLOY_TEST_WORKER_COUNT: path.join(directory, "worker-count"),
      DEPLOY_TEST_INSPECT_COUNT: path.join(directory, "inspect-count"),
      DEPLOY_TEST_WEB_COUNT: path.join(directory, "web-count")
    }
  });

  return {
    directory,
    result,
    log: await readFile(logFile, "utf8")
  };
}

test("worker replica failure restores and verifies the previous release", async () => {
  const { directory, result, log } = await runDeployment(
    "worker_failure",
    "abc123"
  );

  assert.notEqual(result.status, 0);
  assert.match(log, /abc123\|compose up -d --scale worker=1 web worker/);
  assert.match(log, /abc123\|compose up -d --scale topic-worker=1 topic-worker/);
  assert.match(log, /abc123\|compose up -d --scale custom-script-worker=1 custom-script-worker/);
  assert.equal((log.match(/compose ps --status running -q worker/g) || []).length, 3);
  assert.match(result.stderr, /Deployment failed; previous release restored/);
  assert.equal(
    await readFile(path.join(directory, ".deployed-image-tag"), "utf8"),
    "abc123"
  );
});

test("web health failure restores and re-verifies the previous release", async () => {
  const { directory, result, log } = await runDeployment(
    "web_failure",
    "abc123"
  );

  assert.notEqual(result.status, 0);
  assert.match(log, /abc123\|compose up -d --scale worker=1 web worker/);
  assert.match(log, /abc123\|compose up -d --scale topic-worker=1 topic-worker/);
  assert.match(log, /abc123\|compose up -d --scale custom-script-worker=1 custom-script-worker/);
  assert.equal((log.match(/compose exec -T web node -e/g) || []).length, 21);
  assert.match(result.stderr, /Deployment failed; previous release restored/);
  assert.equal(
    await readFile(path.join(directory, ".deployed-image-tag"), "utf8"),
    "abc123"
  );
});

test("compose startup failure restores and re-verifies the previous release", async () => {
  const { directory, result, log } = await runDeployment(
    "startup_failure",
    "abc123"
  );

  assert.notEqual(result.status, 0);
  assert.match(log, /abc123\|compose up -d --scale worker=1 web worker/);
  assert.match(log, /abc123\|compose up -d --scale topic-worker=1 topic-worker/);
  assert.match(log, /abc123\|compose up -d --scale custom-script-worker=1 custom-script-worker/);
  assert.match(result.stderr, /Deployment failed; previous release restored/);
  assert.equal(
    await readFile(path.join(directory, ".deployed-image-tag"), "utf8"),
    "abc123"
  );
});

test("Topic Worker functional failure restores the previous release", async () => {
  const { directory, result, log } = await runDeployment(
    "topic_worker_functional_failure",
    "abc123"
  );
  assert.notEqual(result.status, 0);
  assert.match(log, /def456\|compose exec -T topic-worker npm run worker:topics:check/);
  assert.match(log, /abc123\|compose exec -T topic-worker npm run worker:topics:check/);
  assert.match(result.stderr, /Deployment failed; previous release restored/);
  assert.equal(await readFile(path.join(directory, ".deployed-image-tag"), "utf8"), "abc123");
});

test("missing Extraction Worker tick is classified, fails fast, and restores the previous release", async () => {
  const { directory, result, log } = await runDeployment("missing_tick", "abc123");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /extraction_worker_functional_failed:probe_timed_out/);
  assert.doesNotMatch(log, /def456\|compose exec -T topic-worker npm run worker:topics:check/);
  assert.doesNotMatch(log, /def456\|compose exec -T custom-script-worker npm run worker:custom-scripts:check/);
  assert.match(log, /abc123\|logs --since .* worker-current/);
  assert.equal(await readFile(path.join(directory, ".deployed-image-tag"), "utf8"), "abc123");
});

test("a prior worker tick cannot verify a newly deployed worker instance", async () => {
  const { directory, result, log } = await runDeployment("old_tick", "abc123");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /extraction_worker_functional_failed:probe_timed_out/);
  assert.match(log, /def456\|inspect --format .* worker-current/);
  assert.match(log, /def456\|logs --since .* worker-current/);
  assert.match(log, /abc123\|logs --since .* worker-current/);
  assert.doesNotMatch(log, /def456\|compose exec -T topic-worker npm run worker:topics:check/);
  assert.equal(await readFile(path.join(directory, ".deployed-image-tag"), "utf8"), "abc123");
});

test("a restarted Extraction Worker fails closed and rollback verifies a fresh old-release tick", async () => {
  const { directory, result, log } = await runDeployment("worker_restart", "abc123");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /extraction_worker_functional_failed:probe_setup_failed/);
  assert.match(log, /def456\|inspect --format .* worker-current/);
  assert.match(log, /abc123\|logs --since .* worker-current/);
  assert.match(log, /abc123\|compose exec -T topic-worker npm run worker:topics:check/);
  assert.match(log, /abc123\|compose exec -T custom-script-worker npm run worker:custom-scripts:check/);
  assert.equal(await readFile(path.join(directory, ".deployed-image-tag"), "utf8"), "abc123");
});

test("a busy queue does not block a fresh Extraction Worker tick release gate", async () => {
  const { directory, result, log } = await runDeployment("busy_queue", "abc123");

  assert.equal(result.status, 0);
  assert.match(log, /def456\|inspect --format .* worker-current/);
  assert.match(log, /def456\|logs --since .* worker-current/);
  assert.doesNotMatch(log, /worker:verify-functional/);
  assert.equal(await readFile(path.join(directory, ".deployed-image-tag"), "utf8"), "def456");
});

test("Custom Script Worker functional failure restores the previous release", async () => {
  const { directory, result, log } = await runDeployment(
    "custom_script_worker_functional_failure",
    "abc123"
  );
  assert.notEqual(result.status, 0);
  assert.match(log, /def456\|compose exec -T custom-script-worker npm run worker:custom-scripts:check/);
  assert.match(log, /abc123\|compose exec -T custom-script-worker npm run worker:custom-scripts:check/);
  assert.match(result.stderr, /Deployment failed; previous release restored/);
  assert.equal(await readFile(path.join(directory, ".deployed-image-tag"), "utf8"), "abc123");
});

test("failed first deployment stops the unverified web and worker", async () => {
  const { directory, result, log } = await runDeployment("worker_failure");

  assert.notEqual(result.status, 0);
  assert.match(log, /def456\|compose stop web worker topic-worker custom-script-worker/);
  assert.match(result.stderr, /Deployment failed; no previous release available/);
  await assert.rejects(stat(path.join(directory, ".deployed-image-tag")), {
    code: "ENOENT"
  });
});

test("rollback verification failure keeps the previous success tag", async () => {
  const { directory, result } = await runDeployment(
    "persistent_worker_failure",
    "abc123"
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Deployment failed; rollback verification failed/);
  assert.equal(
    await readFile(path.join(directory, ".deployed-image-tag"), "utf8"),
    "abc123"
  );
});

test("verified web and worker update the successful release tag", async () => {
  const { directory, result } = await runDeployment("success", "abc123");

  assert.equal(result.status, 0);
  assert.equal(
    await readFile(path.join(directory, ".deployed-image-tag"), "utf8"),
    "def456"
  );
});

test("Caddy failure blocks release and does not write a success tag", async () => {
  const { directory, result } = await runDeployment("caddy_failure");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Caddy container verification failed/);
  await assert.rejects(stat(path.join(directory, ".deployed-image-tag")), {
    code: "ENOENT"
  });
});
