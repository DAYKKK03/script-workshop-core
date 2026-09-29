import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

async function read(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("CI and deploy verification apply migrations against PostgreSQL", async () => {
  for (const path of [".github/workflows/ci.yml", ".github/workflows/deploy.yml"]) {
    const workflow = await read(path);
    assert.match(workflow, /services:\s*\n\s+postgres:/);
    const databaseUrl = workflow.match(/DATABASE_URL:\s*([^\n]+)/)?.[1].trim();
    const testDatabaseUrl = workflow.match(/TEST_DATABASE_URL:\s*([^\n]+)/)?.[1].trim();
    assert.ok(databaseUrl);
    assert.ok(testDatabaseUrl);
    assert.notEqual(databaseUrl, testDatabaseUrl);
    assert.match(workflow, /CREATE DATABASE douyin_scripts_test/);
    assert.match(workflow, /DATABASE_URL="\$TEST_DATABASE_URL" npx prisma migrate deploy/);
    assert.match(workflow, /npm test/);
  }
  const deployment = await read(".github/workflows/deploy.yml");
  assert.match(deployment, /image:\s*\n\s+needs:\s*verify/);
  assert.match(deployment, /deploy:\s*\n\s+needs:\s*image/);
});

test("every database-writing integration test uses the shared physical database guard", async () => {
  const workflows = await Promise.all([read(".github/workflows/ci.yml"), read(".github/workflows/deploy.yml")]);
  const databaseTests = await Promise.all([
    "tests/custom-scripts/integration.test.ts",
    "tests/douyin/worker-recovery.test.ts",
    "tests/douyin/worker-functional.test.ts",
    "tests/seed/seed-environment.test.ts",
    "tests/staging/admin-runtime.test.ts"
  ].map(read));

  for (const workflow of workflows) assert.match(workflow, /TEST_DATABASE_URL:/);
  for (const source of databaseTests) {
    assert.match(source, /assertIsolatedTestDatabaseUrl/);
    assert.doesNotMatch(source, /includes\(["']test["']\)|protocol\.startsWith\(["']postgres["']\)/);
    const guardIndex = source.indexOf("assertIsolatedTestDatabaseUrl(");
    const clientIndex = source.indexOf("new PrismaClient");
    const mutationIndex = source.indexOf("process.env.DATABASE_URL =");
    assert.ok(guardIndex >= 0 && (clientIndex < 0 || guardIndex < clientIndex));
    assert.ok(guardIndex >= 0 && (mutationIndex < 0 || guardIndex < mutationIndex));
  }
});

test("production compose requires an encoded DATABASE_URL and pins worker concurrency", async () => {
  const compose = await read("compose.yml");

  assert.doesNotMatch(compose, /postgresql:\/\/\$\{POSTGRES_USER/);
  assert.equal(
    (compose.match(/DATABASE_URL: \$\{DATABASE_URL:\?DATABASE_URL is required\}/g) || [])
      .length,
    4
  );
  assert.match(
    compose,
    /EXTRACTION_WORKER_CONCURRENCY: \$\{EXTRACTION_WORKER_CONCURRENCY:-2\}/
  );
  assert.match(compose, /worker:[\s\S]*?deploy:\s*\n\s+replicas:\s*1/);
  assert.match(compose, /topic-worker:[\s\S]*?deploy:\s*\n\s+replicas:\s*1/);
  assert.match(compose, /custom-script-worker:[\s\S]*?deploy:\s*\n\s+replicas:\s*1/);
});

test("deployment enforces exactly one worker and verifies a fresh container tick without shared queue work", async () => {
  const deploy = await read("deploy/deploy.sh");
  const packageJson = await read("package.json");

  assert.match(deploy, /compose up -d --remove-orphans --scale worker=1/);
  assert.match(deploy, /compose up -d --force-recreate caddy/);
  assert.match(deploy, /--scale topic-worker=1/);
  assert.match(deploy, /--scale custom-script-worker=1/);
  assert.match(deploy, /compose ps --status running -q worker/);
  assert.match(deploy, /verify_release\(\)/);
  assert.match(deploy, /recover_failed_release\(\)/);
  assert.match(deploy, /docker inspect --format/);
  assert.match(deploy, /docker logs --since/);
  assert.match(deploy, /douyin_extraction_worker_tick/);
  assert.doesNotMatch(deploy, /npm run worker:verify-functional/);
  assert.match(deploy, /compose exec -T topic-worker npm run worker:topics:check/);
  assert.match(deploy, /compose exec -T custom-script-worker npm run worker:custom-scripts:check/);
  assert.match(deploy, /DEPLOY_COMPOSE_FILE/);
  assert.match(deploy, /DEPLOY_COMPOSE_BIN/);
  assert.match(deploy, /DEPLOY_SKIP_REMOTE_PREPARE/);
  assert.match(packageJson, /"worker:verify-functional"/);
  assert.match(packageJson, /"worker:topics:check"/);
  assert.match(packageJson, /"worker:custom-scripts:check"/);
});

test("CI executes the Topic Worker dependency and database smoke check", async () => {
  const [ci, deployment, entrypoint, runtime] = await Promise.all([
    read(".github/workflows/ci.yml"),
    read(".github/workflows/deploy.yml"),
    read("worker/topic-worker.ts"),
    read("lib/topics/worker.ts")
  ]);
  assert.match(ci, /npm run worker:topics:check/);
  assert.match(deployment, /npm run worker:topics:check/);
  assert.match(entrypoint, /verifyTopicWorkerRuntime/);
  assert.match(runtime, /\$queryRaw`SELECT 1`/);
});

test("CI executes the Custom Script Worker dependency and database smoke check", async () => {
  const [ci, deployment, entrypoint, runtime] = await Promise.all([
    read(".github/workflows/ci.yml"),
    read(".github/workflows/deploy.yml"),
    read("worker/custom-script-worker.ts"),
    read("lib/custom-scripts/worker.ts")
  ]);
  assert.match(ci, /npm run worker:custom-scripts:check/);
  assert.match(deployment, /npm run worker:custom-scripts:check/);
  assert.match(entrypoint, /verifyCustomScriptWorkerRuntime/);
  assert.match(runtime, /\$queryRaw`SELECT 1`/);
});

test("staging exposes only sanitized Topic Worker outcome logs", async () => {
  const workflow = await read(".github/workflows/staging-topic-log-probe.yml");
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /topic_generation_\(failed\|succeeded\)/);
  assert.match(workflow, /tail -20/);
  assert.doesNotMatch(workflow, /\.env\.production|profileText|prompt|apiKey|DEEPSEEK_API_KEY/);
});

test("backup removes temporary dump files on every exit path", async () => {
  const backup = await read("deploy/backup/backup.sh");
  assert.match(backup, /cleanup\(\)/);
  assert.match(backup, /trap cleanup EXIT/);
  assert.match(backup, /BACKUP_AGE_RECIPIENT/);
  assert.match(backup, /age --recipient "\$BACKUP_AGE_RECIPIENT"/);
  assert.doesNotMatch(backup, /BACKUP_ENCRYPTION_PASSPHRASE|age --passphrase/);
});

test("administrator bootstrap writes setup secrets to an exclusive restricted file", async () => {
  const bootstrap = await read("scripts/bootstrap-admin.ts");
  const provision = await read("lib/admin/bootstrap.ts");

  assert.match(bootstrap, /BOOTSTRAP_ADMIN_OUTPUT_FILE/);
  assert.match(provision, /mode:\s*0o600/);
  assert.match(provision, /flag:\s*"wx"/);
  assert.doesNotMatch(bootstrap, /process\.stdout\.write\(`TOTP_SETUP_URI=/);
});

test("database seed does not print raw provider errors", async () => {
  const seed = await read("prisma/seed.mjs");

  assert.doesNotMatch(seed, /console\.error\(error\)/);
  assert.match(seed, /console\.error\("Database seed failed"\)/);
});

test("production and local Caddy configurations keep HTTPS concerns separate", async () => {
  const production = await read("deploy/Caddyfile");
  const local = await read("deploy/Caddyfile.local");
  const ipHttp = await read("deploy/Caddyfile.ip-http");
  const localCompose = await read("docker-compose.test.yml");

  assert.match(production, /auto_https\s+disable_redirects/);
  assert.match(production, /http:\/\/\{\$APP_DOMAIN\}/);
  assert.match(production, /https:\/\/\{\$APP_DOMAIN\}/);
  assert.doesNotMatch(production, /auto_https\s+off|^:\s*80\s*\{/m);
  assert.match(production, /X-EdgeOne-Origin-Verify/);

  assert.match(local, /auto_https off/);
  assert.match(local, /^:80\s*\{/m);
  assert.match(local, /X-EdgeOne-Origin-Verify/);
  assert.match(ipHttp, /auto_https off/);
  assert.match(ipHttp, /^:80\s*\{/m);
  assert.doesNotMatch(ipHttp, /X-EdgeOne-Origin-Verify/);
  assert.match(localCompose, /\.\/deploy\/Caddyfile\.local:\/etc\/caddy\/Caddyfile:ro/);
});

test("PR and staging deploy gates validate the same formal Caddy image", async () => {
  const ci = await read(".github/workflows/ci.yml");
  const deploy = await read(".github/workflows/deploy.yml");
  for (const workflow of [ci, deploy]) {
    assert.match(workflow, /Validate formal Caddy configuration/);
    assert.match(workflow, /caddy:2\.10-alpine caddy validate/);
  }
});

test("temporary public IP staging mode keeps Caddy as the only public entry and forces safe defaults", async () => {
  const compose = await read("compose.ip-http.yml");

  assert.match(compose, /deploy\/Caddyfile\.ip-http:\/etc\/caddy\/Caddyfile:ro/);
  assert.match(compose, /ports:\s*\n\s*-\s*"80:80"/);
  assert.doesNotMatch(compose, /"443:443"/);
  assert.doesNotMatch(compose, /DOUYIN_PROVIDER:\s*blocked/);
  assert.match(compose, /EXTRACTION_WORKER_CONCURRENCY:\s*"1"/);
  assert.match(compose, /SESSION_COOKIE_SECURE:\s*"false"/);
  assert.doesNotMatch(compose, /5432:5432|3000:3000/);
});

test("standard deployment explicitly keeps secure session cookies", async () => {
  const compose = await read("compose.yml");

  assert.match(compose, /SESSION_COOKIE_SECURE:\s*"true"/);
});

test("environment validation distinguishes standard and temporary staging requirements without printing values", async () => {
  const script = await read("deploy/validate-env.sh");

  assert.match(script, /POSTGRES_PASSWORD/);
  assert.match(script, /DATABASE_URL/);
  assert.match(script, /SESSION_SECRET/);
  assert.match(script, /APP_ORIGIN/);
  assert.match(script, /NEXT_PUBLIC_APP_URL/);
  assert.match(script, /EDGEONE_ORIGIN_SECRET/);
  assert.match(script, /APP_DOMAIN/);
  assert.match(script, /STAGING_ALLOW_IP_HTTP/);
  assert.match(script, /STAGING_ENABLE_REAL_PROVIDERS/);
  assert.match(script, /SESSION_COOKIE_SECURE/);
  assert.match(script, /DOUYIN_PROVIDER/);
  assert.match(script, /TIKHUB_API_KEY/);
  assert.match(script, /TIKHUB_API_BASE_URL/);
  assert.match(script, /VOLCENGINE_ASR_API_KEY/);
  assert.match(script, /DEEPSEEK_API_KEY/);
  assert.match(script, /standard\)[\s\S]*require_value[^\n]*SESSION_COOKIE_SECURE[^\n]*true/);
  assert.match(script, /ip-http\)[\s\S]*require_value[^\n]*SESSION_COOKIE_SECURE[^\n]*false/);
  assert.match(script, /Missing required environment variables:/);
  assert.doesNotMatch(script, /printf '%s'.*=/);
});

test("environment validation rejects session cookie security settings that do not match the deploy mode", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "session-cookie-env-"));
  const composeEnv = [
    "POSTGRES_PASSWORD=test-only-password",
    "APP_DOMAIN=staging.example.test",
    "EDGEONE_ORIGIN_SECRET=test-only-origin-secret",
    "STAGING_ALLOW_IP_HTTP=1"
  ].join("\n");

  try {
    await writeFile(path.join(directory, ".env"), `${composeEnv}\n`);

    for (const scenario of [
      { mode: "standard", value: "true", status: 0 },
      { mode: "standard", value: "false", status: 1 },
      { mode: "ip-http", value: "false", status: 0 },
      { mode: "ip-http", value: "true", status: 1 },
      { mode: "ip-http", value: "invalid", status: 1 }
    ]) {
      await writeFile(
        path.join(directory, ".env.production"),
        [
          "DATABASE_URL=postgresql://app:test-only@db:5432/app?schema=public",
          "SESSION_SECRET=test-only-session-secret-at-least-32-characters",
          "ADMIN_MFA_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          "NEXT_PUBLIC_APP_URL=http://127.0.0.1",
          "APP_ORIGIN=http://127.0.0.1",
          `SESSION_COOKIE_SECURE=${scenario.value}`
        ].join("\n") + "\n"
      );

      const result = spawnSync(
        "/bin/sh",
        ["deploy/validate-env.sh", directory, scenario.mode],
        { cwd: repositoryRoot, encoding: "utf8" }
      );

      assert.equal(
        result.status,
        scenario.status,
        `${scenario.mode}/${scenario.value}: ${result.stderr}`
      );
      assert.doesNotMatch(result.stderr, /test-only-session-secret|postgresql:\/\//);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ip-http validation keeps providers blocked unless explicitly authorized and fully configured", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ip-http-provider-env-"));

  const baseAppEnv = [
    "DATABASE_URL=postgresql://app:test-only@db:5432/app?schema=public",
    "SESSION_SECRET=test-only-session-secret-at-least-32-characters",
    "ADMIN_MFA_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "NEXT_PUBLIC_APP_URL=http://127.0.0.1",
    "APP_ORIGIN=http://127.0.0.1",
    "SESSION_COOKIE_SECURE=false"
  ];

  try {
    for (const scenario of [
      {
        name: "default blocked staging",
        composeEnv: [
          "POSTGRES_PASSWORD=test-only-postgres-password",
          "STAGING_ALLOW_IP_HTTP=1"
        ],
        appEnv: [...baseAppEnv, "DOUYIN_PROVIDER=blocked"],
        status: 0
      },
      {
        name: "explicit stop-loss keeps blocked mode valid",
        composeEnv: [
          "POSTGRES_PASSWORD=test-only-postgres-password",
          "STAGING_ALLOW_IP_HTTP=1",
          "STAGING_ENABLE_REAL_PROVIDERS=0"
        ],
        appEnv: [...baseAppEnv, "DOUYIN_PROVIDER=blocked"],
        status: 0
      },
      {
        name: "real providers require explicit opt-in",
        composeEnv: [
          "POSTGRES_PASSWORD=test-only-postgres-password",
          "STAGING_ALLOW_IP_HTTP=1"
        ],
        appEnv: [...baseAppEnv, "DOUYIN_PROVIDER=tikhub"],
        status: 1
      },
      {
        name: "invalid provider fails fast when real providers are enabled",
        composeEnv: [
          "POSTGRES_PASSWORD=test-only-postgres-password",
          "STAGING_ALLOW_IP_HTTP=1",
          "STAGING_ENABLE_REAL_PROVIDERS=1"
        ],
        appEnv: [...baseAppEnv, "DOUYIN_PROVIDER=deepseek"],
        status: 1
      },
      {
        name: "invalid enable switch fails fast",
        composeEnv: [
          "POSTGRES_PASSWORD=test-only-postgres-password",
          "STAGING_ALLOW_IP_HTTP=1",
          "STAGING_ENABLE_REAL_PROVIDERS=maybe"
        ],
        appEnv: [...baseAppEnv, "DOUYIN_PROVIDER=blocked"],
        status: 1
      },
      {
        name: "enabled real providers require vendor credentials",
        composeEnv: [
          "POSTGRES_PASSWORD=test-only-postgres-password",
          "STAGING_ALLOW_IP_HTTP=1",
          "STAGING_ENABLE_REAL_PROVIDERS=1"
        ],
        appEnv: [...baseAppEnv, "DOUYIN_PROVIDER=tikhub"],
        status: 1
      },
      {
        name: "enabled real providers accept tikhub with required credentials",
        composeEnv: [
          "POSTGRES_PASSWORD=test-only-postgres-password",
          "STAGING_ALLOW_IP_HTTP=1",
          "STAGING_ENABLE_REAL_PROVIDERS=1"
        ],
        appEnv: [
          ...baseAppEnv,
          "DOUYIN_PROVIDER=tikhub",
          "TIKHUB_API_KEY=test-only-tikhub-key",
          "TIKHUB_API_BASE_URL=https://api.example.test",
          "VOLCENGINE_ASR_API_KEY=test-only-asr-key",
          "VOLCENGINE_ASR_ENDPOINT=https://asr-submit.example.test",
          "VOLCENGINE_ASR_RESOURCE_ID=test-resource",
          "DEEPSEEK_API_KEY=test-only-deepseek-key",
          "DEEPSEEK_API_BASE_URL=https://deepseek.example.test",
          "DEEPSEEK_MODEL=deepseek-v4-flash"
        ],
        status: 0
      },
      {
        name: "enabled media relay requires object storage config",
        composeEnv: [
          "POSTGRES_PASSWORD=test-only-postgres-password",
          "STAGING_ALLOW_IP_HTTP=1",
          "STAGING_ENABLE_REAL_PROVIDERS=1"
        ],
        appEnv: [
          ...baseAppEnv,
          "DOUYIN_PROVIDER=tikhub",
          "TIKHUB_API_KEY=test-only-tikhub-key",
          "TIKHUB_API_BASE_URL=https://api.example.test",
          "VOLCENGINE_ASR_API_KEY=test-only-asr-key",
          "VOLCENGINE_ASR_ENDPOINT=https://asr-submit.example.test",
          "VOLCENGINE_ASR_RESOURCE_ID=test-resource",
          "DEEPSEEK_API_KEY=test-only-deepseek-key",
          "DEEPSEEK_API_BASE_URL=https://deepseek.example.test",
          "DEEPSEEK_MODEL=deepseek-v4-flash",
          "MEDIA_RELAY_ENABLED=1"
        ],
        status: 1
      },
      {
        name: "enabled media relay accepts object storage config",
        composeEnv: [
          "POSTGRES_PASSWORD=test-only-postgres-password",
          "STAGING_ALLOW_IP_HTTP=1",
          "STAGING_ENABLE_REAL_PROVIDERS=1"
        ],
        appEnv: [
          ...baseAppEnv,
          "DOUYIN_PROVIDER=tikhub",
          "TIKHUB_API_KEY=test-only-tikhub-key",
          "TIKHUB_API_BASE_URL=https://api.example.test",
          "VOLCENGINE_ASR_API_KEY=test-only-asr-key",
          "VOLCENGINE_ASR_ENDPOINT=https://asr-submit.example.test",
          "VOLCENGINE_ASR_RESOURCE_ID=test-resource",
          "DEEPSEEK_API_KEY=test-only-deepseek-key",
          "DEEPSEEK_API_BASE_URL=https://deepseek.example.test",
          "DEEPSEEK_MODEL=deepseek-v4-flash",
          "MEDIA_RELAY_ENABLED=1",
          "COS_BUCKET=test-only-bucket",
          "COS_REGION=ap-hongkong",
          "COS_ENDPOINT=cos.ap-hongkong.myqcloud.com",
          "COS_ACCESS_KEY_ID=test-only-cos-access-key",
          "COS_SECRET_ACCESS_KEY=test-only-cos-secret-key",
          "MEDIA_RELAY_PUBLIC_BASE_URL=https://media.example.test"
        ],
        status: 0
      }
    ]) {
      await writeFile(path.join(directory, ".env"), `${scenario.composeEnv.join("\n")}\n`);
      await writeFile(
        path.join(directory, ".env.production"),
        `${scenario.appEnv.join("\n")}\n`
      );

      const result = spawnSync(
        "/bin/sh",
        ["deploy/validate-env.sh", directory, "ip-http"],
        { cwd: repositoryRoot, encoding: "utf8" }
      );

      assert.equal(result.status, scenario.status, `${scenario.name}: ${result.stderr}`);
      assert.doesNotMatch(
        result.stderr,
        /test-only-session-secret|test-only-tikhub-key|test-only-asr-key|test-only-deepseek-key|test-only-cos-access-key|test-only-cos-secret-key|postgresql:\/\//
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("local Compose uses its own isolated PostgreSQL test database", async () => {
  const localCompose = await read("docker-compose.test.yml");

  assert.match(localCompose, /\n  db:\n[\s\S]*POSTGRES_DB:\s*douyin_scripts_test/);
  assert.match(localCompose, /postgresql:\/\/app:[^@]+@db:5432\/douyin_scripts_test/);
  assert.doesNotMatch(localCompose, /host\.docker\.internal|douyin_scripts\?schema/);
});

test("local Compose is self-contained and cannot enable paid providers", async () => {
  const localCompose = await read("docker-compose.test.yml");
  const middleware = await read("middleware.ts");

  assert.doesNotMatch(localCompose, /env_file:\s*\.env\.production/);
  assert.equal((localCompose.match(/DOUYIN_PROVIDER:\s*blocked/g) || []).length, 2);
  assert.match(localCompose, /EXTRACTION_WORKER_CONCURRENCY:\s*2/);
  assert.equal(
    (localCompose.match(/image:\s*\$\{APP_IMAGE:-douyin-script-test\}:\$\{IMAGE_TAG:-latest\}/g) || []).length,
    2
  );
  assert.match(localCompose, /127\.0\.0\.1:55432:5432/);
  assert.doesNotMatch(localCompose, /(?:^|["'])0\.0\.0\.0:55432:5432/m);
  assert.match(localCompose, /APP_ORIGIN:\s*"http:\/\/localhost:8080"/);
  assert.match(middleware, /process\.env\.APP_ORIGIN/);
});

test("Git ignores local provisioning, backup, and test-output artifacts", async () => {
  const gitignore = await read(".gitignore");

  for (const pattern of [
    "*.provision.json",
    "*.dump",
    "*.age",
    "coverage/",
    "test-results/"
  ]) {
    assert.ok(gitignore.includes(pattern), `missing ignore pattern: ${pattern}`);
  }
});

test("load test sends the runtime origin header without embedding its value", async () => {
  const loadTest = await read("tests/load/k6-smoke.js");

  assert.match(loadTest, /__ENV\.ORIGIN_SECRET/);
  assert.match(loadTest, /X-EdgeOne-Origin-Verify/);
  assert.doesNotMatch(loadTest, /test-origin-secret/);
});
