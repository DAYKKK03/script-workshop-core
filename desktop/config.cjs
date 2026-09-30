const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const providerFields = Object.freeze({
  DEEPSEEK_API_KEY: "secret",
  DEEPSEEK_API_BASE_URL: "url",
  DEEPSEEK_MODEL: "text",
  TIKHUB_API_KEY: "secret",
  TIKHUB_API_BASE_URL: "url",
  VOLCENGINE_ASR_API_KEY: "secret",
  VOLCENGINE_ASR_SUBMIT_ENDPOINT: "url",
  VOLCENGINE_ASR_QUERY_ENDPOINT: "url",
  VOLCENGINE_ASR_RESOURCE_ID: "text",
  VOLCENGINE_APP_ID: "text",
  VOLCENGINE_CLUSTER: "text",
  VOLCENGINE_ASR_MODEL: "text",
  COS_ACCESS_KEY_ID: "secret",
  COS_SECRET_ACCESS_KEY: "secret",
  COS_BUCKET: "text",
  COS_REGION: "text",
  COS_ENDPOINT: "text",
  MEDIA_RELAY_PUBLIC_BASE_URL: "url"
});

function validateProviders(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("配置格式无效");
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    const type = providerFields[key];
    if (!type || typeof value !== "string" || value.length > 2048 || /[\r\n\0]/.test(value)) {
      throw new Error(`无效配置项：${key}`);
    }
    const trimmed = value.trim();
    if (type === "url" && trimmed) {
      let parsed;
      try { parsed = new URL(trimmed); } catch { throw new Error(`地址格式无效：${key}`); }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(`地址必须是 HTTPS：${key}`);
    }
    result[key] = trimmed;
  }
  return result;
}

function createStore(userData, safeStorage) {
  const file = path.join(userData, "desktop-config.json");
  const read = () => {
    if (!fs.existsSync(file)) return null;
    const stored = JSON.parse(fs.readFileSync(file, "utf8"));
    if (stored.version !== 1 || !safeStorage.isEncryptionAvailable()) throw new Error("无法读取本机加密配置");
    return JSON.parse(safeStorage.decryptString(Buffer.from(stored.encrypted, "base64")));
  };
  const write = (value) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("本机加密服务不可用");
    fs.mkdirSync(userData, { recursive: true, mode: 0o700 });
    const encrypted = safeStorage.encryptString(JSON.stringify(value)).toString("base64");
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, encrypted }), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  const initialise = () => {
    let value = read();
    if (value) return value;
    value = {
      sessionSecret: crypto.randomBytes(48).toString("base64url"),
      mfaKey: crypto.randomBytes(32).toString("base64"),
      databasePassword: crypto.randomBytes(32).toString("base64url"),
      inviteCode: crypto.randomBytes(18).toString("base64url"),
      providers: {}
    };
    write(value);
    return value;
  };
  const updateProviders = (input) => {
    const value = initialise();
    value.providers = { ...value.providers, ...validateProviders(input) };
    write(value);
    return maskedProviders(value.providers);
  };
  return { initialise, read, updateProviders, file };
}

function maskedProviders(providers) {
  return Object.fromEntries(Object.entries(providerFields).map(([key, kind]) => [
    key, kind === "secret" ? (providers[key] ? "已配置" : "") : (providers[key] || "")
  ]));
}

module.exports = { providerFields, validateProviders, createStore, maskedProviders };
