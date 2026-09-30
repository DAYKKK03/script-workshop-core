const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const { createStore, maskedProviders } = require("./config.cjs");
const { DesktopRuntime } = require("./runtime.cjs");

let settingsWindow;
let workWindow;
let runtime;
let stopping = false;
let launchPromise;
let status = "尚未启动";
const settingsFile = path.join(__dirname, "settings.html");
const settingsUrl = pathToFileURL(settingsFile).href;

if (process.env.SCRIPT_WORKSHOP_USER_DATA) {
  const isolatedData = path.resolve(process.env.SCRIPT_WORKSHOP_USER_DATA);
  fs.mkdirSync(isolatedData, { recursive: true, mode: 0o700 });
  app.setPath("userData", isolatedData);
  app.setPath("sessionData", isolatedData);
}

function workPaths() {
  return {
    userData: app.getPath("userData"),
    bundleDir: app.isPackaged ? path.join(process.resourcesPath, "core") : path.join(__dirname, "..", "desktop-bundle"),
    appDir: app.getAppPath()
  };
}

function publishStatus(value) {
  status = value;
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send("desktop:status", value);
}

function trusted(event) {
  if (!settingsWindow || event.sender !== settingsWindow.webContents || event.senderFrame?.url !== settingsUrl) {
    throw new Error("无权访问本地配置");
  }
}

function showWork(url) {
  if (!workWindow || workWindow.isDestroyed()) {
    workWindow = new BrowserWindow({ width: 1280, height: 840, minWidth: 800, minHeight: 600, title: "脚本工坊" });
    workWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    workWindow.webContents.on("will-navigate", (event, target) => {
      if (!target.startsWith(`${url}/`) && target !== url) event.preventDefault();
    });
  }
  workWindow.loadURL(`${url}/login`);
  workWindow.show();
}

async function launch() {
  if (launchPromise) return launchPromise;
  launchPromise = (async () => {
    if (runtime) await runtime.stop();
    const config = createStore(app.getPath("userData"), safeStorage).initialise();
    runtime = new DesktopRuntime({ ...workPaths(), config, onStatus: publishStatus });
    const url = await runtime.start();
    showWork(url);
    return { status: "运行中", url };
  })();
  try { return await launchPromise; }
  finally { launchPromise = null; }
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 650, height: 780, minWidth: 560, minHeight: 620,
    title: "脚本工坊 · 本地配置",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  settingsWindow.webContents.on("will-navigate", (event, target) => {
    if (target !== settingsUrl) event.preventDefault();
  });
  settingsWindow.loadFile(settingsFile);
}

app.whenReady().then(() => {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  app.on("second-instance", () => (workWindow && !workWindow.isDestroyed() ? workWindow : settingsWindow)?.focus());
  const store = createStore(app.getPath("userData"), safeStorage);
  try { store.initialise(); } catch { publishStatus("本机加密服务不可用，请检查系统密钥服务"); }
  ipcMain.handle("desktop:get", (event) => {
    trusted(event);
    const config = store.initialise();
    return { status, inviteCode: config.inviteCode, providers: maskedProviders(config.providers) };
  });
  ipcMain.handle("desktop:save", async (event, input) => {
    trusted(event);
    const providers = store.updateProviders(input);
    if (runtime) await launch();
    return { providers, status };
  });
  ipcMain.handle("desktop:start", async (event) => { trusted(event); return launch(); });
  createSettingsWindow();
});

app.on("before-quit", (event) => {
  if (stopping || !runtime) return;
  event.preventDefault();
  stopping = true;
  runtime.stop().finally(() => app.quit());
});
app.on("window-all-closed", () => app.quit());
