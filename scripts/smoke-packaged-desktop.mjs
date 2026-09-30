import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.join(process.cwd(), "dist-desktop");
const platform = process.platform;
let executable;
if (platform === "darwin") {
  const directory = fs.readdirSync(root).find((name) => name.startsWith("mac") && fs.statSync(path.join(root, name)).isDirectory());
  const appName = fs.readdirSync(path.join(root, directory)).find((name) => name.endsWith(".app"));
  const binDirectory = path.join(root, directory, appName, "Contents", "MacOS");
  executable = path.join(binDirectory, fs.readdirSync(binDirectory)[0]);
} else if (platform === "win32") {
  const binDirectory = path.join(root, "win-unpacked");
  executable = path.join(binDirectory, fs.readdirSync(binDirectory).find((name) => name.endsWith(".exe")));
} else throw new Error("Unsupported smoke platform");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "script-workshop-packaged-smoke-"));
const env = { ...process.env, SCRIPT_WORKSHOP_SMOKE: "1", SCRIPT_WORKSHOP_USER_DATA: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
try {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(executable, [], {
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Packaged smoke timed out")); }, 90000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); code === 0 && stdout.includes("DESKTOP_SMOKE_OK") ? resolve(stdout.trim()) : reject(new Error(`Packaged smoke failed (${code}): ${stderr.slice(-1000)}`)); });
  });
  console.log(output);
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
