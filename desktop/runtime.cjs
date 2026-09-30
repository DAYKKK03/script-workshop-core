const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function waitForExit(child, timeoutMs = 8000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, timeoutMs);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

function runCommand(executable, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { ...options, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`启动任务失败（退出码 ${code}）`)));
  });
}

async function waitForWeb(url, child, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Web 服务启动失败");
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(1000) });
      if (response.status < 500) return;
    } catch { /* retry while the server starts */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Web 服务启动超时");
}

class DesktopRuntime {
  constructor({ userData, bundleDir, appDir, config, executable = process.execPath, postgresFactory, onStatus = () => {} }) {
    this.userData = userData;
    this.bundleDir = bundleDir;
    this.appDir = appDir;
    this.config = config;
    this.executable = executable;
    this.postgresFactory = postgresFactory;
    this.onStatus = onStatus;
    this.children = [];
    this.postgres = null;
    this.startPromise = null;
    this.url = null;
    this.stopping = false;
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal().catch(async (error) => {
      await this.stopInternal();
      this.startPromise = null;
      throw error;
    });
    return this.startPromise;
  }

  async startInternal() {
    const dbDir = path.join(this.userData, "postgres");
    fs.mkdirSync(this.userData, { recursive: true, mode: 0o700 });
    const firstRun = !fs.existsSync(path.join(dbDir, "PG_VERSION"));
    const dbPort = await freePort();
    const webPort = await freePort();
    const factory = this.postgresFactory || (async () => (await import("embedded-postgres")).default);
    const EmbeddedPostgres = await factory();
    this.postgres = new EmbeddedPostgres({
      databaseDir: dbDir,
      user: "app",
      password: this.config.databasePassword,
      port: dbPort,
      authMethod: "scram-sha-256",
      persistent: true,
      initdbFlags: ["--encoding=UTF8"],
      postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "unix_socket_directories="],
      onLog: process.env.SCRIPT_WORKSHOP_DEBUG_POSTGRES === "1" ? (message) => process.stderr.write(String(message)) : () => {},
      onError: process.env.SCRIPT_WORKSHOP_DEBUG_POSTGRES === "1" ? (error) => process.stderr.write(String(error)) : () => {}
    });
    this.onStatus("正在启动本地数据库");
    if (firstRun) await this.postgres.initialise();
    await this.postgres.start();
    const adminClient = this.postgres.getPgClient("postgres", "127.0.0.1");
    await adminClient.connect();
    let databaseExists;
    try { databaseExists = (await adminClient.query("SELECT 1 FROM pg_database WHERE datname = 'script_workshop'")).rowCount > 0; }
    finally { await adminClient.end(); }
    if (!databaseExists) await this.postgres.createDatabase("script_workshop");
    const databaseUrl = `postgresql://app:${encodeURIComponent(this.config.databasePassword)}@127.0.0.1:${dbPort}/script_workshop?schema=public`;
    const url = `http://127.0.0.1:${webPort}`;
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: this.config.sessionSecret,
      ADMIN_MFA_ENCRYPTION_KEY: this.config.mfaKey,
      SESSION_COOKIE_SECURE: "false",
      APP_ORIGIN: url,
      HOSTNAME: "127.0.0.1",
      PORT: String(webPort),
      DOUYIN_PROVIDER: this.config.providers.TIKHUB_API_KEY && this.config.providers.TIKHUB_API_BASE_URL ? "tikhub" : "blocked",
      MEDIA_RELAY_ENABLED: ["COS_ACCESS_KEY_ID", "COS_SECRET_ACCESS_KEY", "COS_BUCKET", "COS_REGION", "MEDIA_RELAY_PUBLIC_BASE_URL"].every((key) => this.config.providers[key]) ? "1" : "0",
      MEDIA_RELAY_FFMPEG_PATH: require("ffmpeg-static"),
      MEDIA_RELAY_TMP_DIR: path.join(this.userData, "media-tmp"),
      ...this.config.providers
    };
    this.onStatus("正在更新本地数据");
    const prismaCli = path.join(this.appDir, "node_modules", "prisma", "build", "index.js");
    await runCommand(this.executable, [prismaCli, "migrate", "deploy", "--schema", path.join(this.bundleDir, "prisma", "schema.prisma")], {
      cwd: this.bundleDir, env
    });
    const client = this.postgres.getPgClient("script_workshop", "127.0.0.1");
    await client.connect();
    try { await client.query('INSERT INTO "InviteCode" ("code") VALUES ($1) ON CONFLICT ("code") DO NOTHING', [this.config.inviteCode]); }
    finally { await client.end(); }

    this.onStatus("正在启动应用");
    const scripts = [
      path.join(this.bundleDir, "server", "server.js"),
      ...["extraction", "topic", "custom-script"].map((name) => path.join(this.bundleDir, "server", `worker-${name}.cjs`))
    ];
    for (const script of scripts) {
      const child = spawn(this.executable, [script], { cwd: path.join(this.bundleDir, "server"), env, stdio: "ignore" });
      child.on("error", () => this.onStatus("后台进程启动失败"));
      child.on("exit", () => {
        if (!this.stopping && this.url) this.onStatus("后台进程意外停止，请重新启动应用");
      });
      this.children.push(child);
    }
    await waitForWeb(`${url}/login`, this.children[0]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (this.children.some((child) => child.exitCode !== null || child.signalCode !== null)) {
      throw new Error("后台任务启动失败");
    }
    this.url = url;
    this.onStatus("运行中");
    return url;
  }

  async stop() {
    if (!this.startPromise && !this.postgres) return;
    if (this.startPromise) await this.startPromise.catch(() => {});
    await this.stopInternal();
    this.startPromise = null;
  }

  async stopInternal() {
    this.stopping = true;
    const children = this.children.splice(0);
    await Promise.all(children.map((child) => waitForExit(child)));
    if (this.postgres) {
      const pg = this.postgres;
      this.postgres = null;
      if (pg.process && (pg.process.exitCode !== null || pg.process.signalCode !== null)) {
        pg.process = undefined;
      } else {
        let timer;
        await Promise.race([
          pg.stop(),
          new Promise((resolve) => {
            timer = setTimeout(() => {
              if (pg.process && pg.process.exitCode === null && pg.process.signalCode === null) pg.process.kill("SIGKILL");
              resolve();
            }, 10000);
          })
        ]).finally(() => clearTimeout(timer));
      }
    }
    this.url = null;
    this.onStatus("已停止");
    this.stopping = false;
  }
}

module.exports = { DesktopRuntime, freePort, waitForExit };
