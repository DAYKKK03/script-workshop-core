const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DesktopRuntime } = require("../desktop/runtime.cjs");

const bundleDir = path.join(__dirname, "..", "desktop-bundle");

test("本地应用无需 Docker 完成注册、项目创建和重启持久化", { timeout: 90000 }, async () => {
  assert.ok(fs.existsSync(path.join(bundleDir, "server", "server.js")), "先运行 npm run desktop:prepare");
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "core-desktop-runtime-"));
  const config = {
    sessionSecret: crypto.randomBytes(48).toString("base64url"),
    mfaKey: crypto.randomBytes(32).toString("base64"),
    databasePassword: crypto.randomBytes(32).toString("base64url"),
    inviteCode: crypto.randomBytes(18).toString("base64url"),
    providers: {}
  };
  const createRuntime = () => new DesktopRuntime({ userData, bundleDir, appDir: path.join(__dirname, ".."), config, onStatus: (value) => console.log(`Desktop runtime: ${value}`) });
  let runtime = createRuntime();
  const account = `desktop${Date.now()}`;
  const password = "Local-test-password-123!";
  try {
    let url = await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(runtime.children.length, 4);
    assert.ok(runtime.children.every((child) => child.exitCode === null && child.signalCode === null), "Web 和三个 Worker 应保持运行");
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
    assert.equal((await fetch(`${url}/api/projects`)).status, 401);
    const register = await fetch(`${url}/api/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: url },
      body: JSON.stringify({ account, password, inviteCode: config.inviteCode })
    });
    assert.equal(register.status, 201);
    const cookie = register.headers.get("set-cookie").split(";")[0];
    const create = await fetch(`${url}/api/projects`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: url, Cookie: cookie },
      body: JSON.stringify({ projectName: "本地商家", profileText: "本店主营咖啡" })
    });
    assert.equal(create.status, 201);
    const childProcesses = [...runtime.children];
    const postgresProcess = runtime.postgres.process;
    await runtime.stop();
    assert.ok(childProcesses.every((child) => child.exitCode !== null || child.signalCode !== null));
    assert.ok(postgresProcess.exitCode !== null || postgresProcess.signalCode !== null);

    runtime = createRuntime();
    url = await runtime.start();
    const login = await fetch(`${url}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: url },
      body: JSON.stringify({ account, password })
    });
    assert.equal(login.status, 200);
    const loginCookie = login.headers.get("set-cookie").split(";")[0];
    const list = await fetch(`${url}/api/projects`, { headers: { Cookie: loginCookie } });
    assert.equal(list.status, 200);
    assert.equal((await list.json()).data.projects[0].profileText, "本店主营咖啡");
  } finally {
    await runtime.stop();
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
  }
});
