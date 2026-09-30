const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createStore, validateProviders } = require("../desktop/config.cjs");

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(`encrypted:${text}`),
  decryptString: (buffer) => buffer.toString().slice("encrypted:".length)
};

test("首次启动生成独立凭据，持久化后读取相同凭据", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "core-desktop-config-"));
  try {
    const store = createStore(dir, safeStorage);
    const first = store.initialise();
    assert.ok(first.sessionSecret.length >= 32);
    assert.equal(first.mfaKey.length, 44);
    assert.deepEqual(createStore(dir, safeStorage).initialise(), first);
    const disk = fs.readFileSync(store.file, "utf8");
    assert.ok(!disk.includes(first.sessionSecret));
    assert.ok(!disk.includes(first.inviteCode));
    if (process.platform !== "win32") assert.equal(fs.statSync(store.file).mode & 0o777, 0o600);
    store.updateProviders({ DEEPSEEK_API_KEY: "local-key" });
    assert.equal(store.read().providers.DEEPSEEK_API_KEY, "local-key");
    assert.ok(!fs.readFileSync(store.file, "utf8").includes("local-key"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("仅允许已声明配置，远端地址必须是 HTTPS", () => {
  assert.throws(() => validateProviders({ SESSION_SECRET: "override" }));
  assert.throws(() => validateProviders({ TIKHUB_API_BASE_URL: "http://api.example" }));
  assert.throws(() => validateProviders({ DEEPSEEK_API_KEY: "a\nb" }));
  assert.deepEqual(validateProviders({ DEEPSEEK_API_KEY: " key " }), { DEEPSEEK_API_KEY: "key" });
});
