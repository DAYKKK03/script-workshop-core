import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

async function read(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

function jobBlock(workflow: string, name: string) {
  const match = workflow.match(
    new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z][a-z0-9_-]*:\\n|$)`)
  );
  assert.ok(match, `workflow job ${name} must exist`);
  return match[1];
}

test("verification and image builds stay on GitHub-hosted runners", async () => {
  const workflow = await read(".github/workflows/deploy.yml");

  assert.match(jobBlock(workflow, "verify"), /runs-on:\s*ubuntu-latest/);
  assert.match(jobBlock(workflow, "image"), /runs-on:\s*ubuntu-latest/);
});

test("deployment is restricted to the staging self-hosted runner", async () => {
  const workflow = await read(".github/workflows/deploy.yml");
  const deploy = jobBlock(workflow, "deploy");

  assert.match(deploy, /if:\s*github\.ref\s*==\s*'refs\/heads\/staging'/);
  assert.match(deploy, /runs-on:\s*\[self-hosted, Linux, X64, staging-hk\]/);
  assert.match(deploy, /environment:\s*staging/);
  assert.doesNotMatch(deploy, /production|github\.ref_name\s*==\s*'main'/);
  assert.match(deploy, /permissions:[\s\S]*contents:\s*read/);
  assert.match(deploy, /permissions:[\s\S]*packages:\s*read/);
});

test("deployment exposes an auditable staging deploy mode input", async () => {
  const workflow = await read(".github/workflows/deploy.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /deploy_mode:/);
  assert.match(workflow, /type:\s*choice/);
  assert.match(workflow, /options:\s*\n\s*-\s*standard\n\s*-\s*ip-http/);
});

test("deployment no longer depends on public SSH transport", async () => {
  const workflow = await read(".github/workflows/deploy.yml");
  const deploy = jobBlock(workflow, "deploy");

  assert.doesNotMatch(
    deploy,
    /DEPLOY_SSH_KEY|DEPLOY_KNOWN_HOSTS|DEPLOY_HOST|DEPLOY_USER|\bscp\b|\bssh\b/
  );
});

test("self-hosted deployment uses an explicit file whitelist and preserves runtime state", async () => {
  const script = await read("deploy/self-hosted-deploy.sh");

  for (const path of [
    "compose.yml",
    "compose.ip-http.yml",
    "deploy/Caddyfile",
    "deploy/Caddyfile.local",
    "deploy/Caddyfile.ip-http",
    "deploy/backup/Dockerfile",
    "deploy/backup/backup.sh",
    "deploy/deploy.sh",
    "deploy/server-hardening.sh",
    "deploy/self-hosted-deploy.sh",
    "deploy/validate-env.sh"
  ]) {
    assert.ok(script.includes(path), `deployment whitelist must include ${path}`);
  }

  assert.doesNotMatch(script, /rsync|--delete|cp\s+-[A-Za-z]*r|cp\s+deploy\//);
  assert.doesNotMatch(script, /\.env(?:\.production)?|\.deployed-image-tag/);
});

test("self-hosted deployment uses temporary GHCR credentials and the current commit SHA", async () => {
  const workflow = await read(".github/workflows/deploy.yml");
  const deploy = jobBlock(workflow, "deploy");
  const script = await read("deploy/self-hosted-deploy.sh");

  assert.match(deploy, /ref:\s*\$\{\{ github\.sha \}\}/);
  assert.match(deploy, /GITHUB_TOKEN:\s*\$\{\{ github\.token \}\}/);
  assert.match(deploy, /APP_IMAGE:\s*\$\{\{ needs\.image\.outputs\.image \}\}/);
  assert.match(deploy, /DEPLOY_MODE:/);
  assert.match(script, /deploy_mode="\$\{DEPLOY_MODE:-standard\}"/);
  assert.match(script, /sh "\$deploy_root\/deploy\/validate-env\.sh" "\$deploy_root" "\$deploy_mode"/);
  assert.match(script, /DEPLOY_COMPOSE_FILE="\$compose_files"/);
  assert.match(deploy, /self-hosted-deploy\.sh[\s\S]*\$\{\{ github\.sha \}\}/);

  assert.match(script, /mktemp -d/);
  assert.match(
    script,
    /docker login "\$registry" \\\n\s+--username "\$GITHUB_ACTOR" --password-stdin/
  );
  assert.match(script, /docker logout/);
  assert.match(
    script,
    /APP_IMAGE="\$APP_IMAGE" DEPLOY_COMPOSE_FILE="\$compose_files" sh \.\/deploy\/deploy\.sh "\$tag"/
  );
});

test("self-hosted deployment preserves runtime files and removes temporary registry credentials", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "self-hosted-deploy-"));
  const deployRoot = path.join(directory, "runtime");
  const bin = path.join(directory, "bin");
  const dockerLog = path.join(directory, "docker.log");
  const fakeDocker = `#!/bin/sh
printf '%s|%s|%s\n' "\${DOCKER_CONFIG:-unset}" "\${IMAGE_TAG:-unset}" "$*" >> "$SELF_HOSTED_TEST_LOG"
case "$1" in
  login) cat >/dev/null ;;
esac
case "$*" in
  *"ps --status running -q worker") printf 'worker-current\n' ;;
  *"ps --status running -q topic-worker") printf 'topic-worker-one\n' ;;
  *"ps --status running -q custom-script-worker") printf 'custom-script-worker-one\n' ;;
  *"ps --status running -q caddy") printf 'caddy-one\n' ;;
  "inspect --format "*) printf '%s\n' '2026-08-24T06:00:00Z' ;;
  "logs --since "*) printf '%s\n' '{"event":"douyin_extraction_worker_tick"}' ;;
esac
exit 0
`;
  const fakeDate = `#!/bin/sh
printf '%s\\n' '2026-08-24T05:00:00Z'
`;

  try {
    await mkdir(deployRoot, { recursive: true });
    await mkdir(bin);
    await writeFile(
      path.join(deployRoot, ".env"),
      [
        "POSTGRES_PASSWORD=test-only-postgres-password",
        "APP_DOMAIN=staging.example.test",
        "EDGEONE_ORIGIN_SECRET=test-only-origin-secret"
      ].join("\n") + "\n"
    );
    await writeFile(
      path.join(deployRoot, ".env.production"),
      [
        "DATABASE_URL=postgresql://app:test-only@db:5432/douyin_scripts?schema=public",
        "SESSION_SECRET=test-only-session-secret-at-least-32-characters",
        "ADMIN_MFA_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "NEXT_PUBLIC_APP_URL=http://127.0.0.1",
        "APP_ORIGIN=http://127.0.0.1",
        "SESSION_COOKIE_SECURE=true"
      ].join("\n") + "\n"
    );
    await writeFile(path.join(deployRoot, ".deployed-image-tag"), "abc123");
    await writeFile(path.join(deployRoot, "runtime-data"), "keep\n");
    await writeFile(path.join(bin, "docker"), fakeDocker);
    await writeFile(path.join(bin, "date"), fakeDate);
    await chmod(path.join(bin, "docker"), 0o755);
    await chmod(path.join(bin, "date"), 0o755);

    const result = spawnSync(
      "/bin/sh",
      ["deploy/self-hosted-deploy.sh", "def456"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH || ""}`,
          APP_IMAGE: "ghcr.io/example/application",
          DEPLOY_ROOT: deployRoot,
          GITHUB_ACTOR: "test-actor",
          GITHUB_TOKEN: "test-only-token",
          SELF_HOSTED_TEST_LOG: dockerLog
        }
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(path.join(deployRoot, ".env"), "utf8"), /POSTGRES_PASSWORD=/);
    assert.equal(
      await readFile(path.join(deployRoot, ".env.production"), "utf8"),
      [
        "DATABASE_URL=postgresql://app:test-only@db:5432/douyin_scripts?schema=public",
        "SESSION_SECRET=test-only-session-secret-at-least-32-characters",
        "ADMIN_MFA_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "NEXT_PUBLIC_APP_URL=http://127.0.0.1",
        "APP_ORIGIN=http://127.0.0.1",
        "SESSION_COOKIE_SECURE=true"
      ].join("\n") + "\n"
    );
    assert.equal(await readFile(path.join(deployRoot, "runtime-data"), "utf8"), "keep\n");
    assert.equal(await readFile(path.join(deployRoot, ".deployed-image-tag"), "utf8"), "def456");

    const log = await readFile(dockerLog, "utf8");
    assert.match(log, /login ghcr\.io --username test-actor --password-stdin/);
    assert.match(log, /logout ghcr\.io/);
    assert.doesNotMatch(log, /test-only-token/);
    assert.match(log, /def456\|compose -f .*compose\.yml pull web worker/);

    const dockerConfigs = new Set(
      log.trim().split("\n").map((line) => line.split("|", 1)[0])
    );
    assert.equal(dockerConfigs.size, 1);
    await assert.rejects(stat([...dockerConfigs][0]), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
