import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "node_modules", "embedded-postgres", "dist", "index.js");
if (!fs.existsSync(file)) throw new Error("embedded-postgres is missing");
const source = fs.readFileSync(file, "utf8");
const original = "if ((stat.mode & BIN_PERMISSIONS) !== BIN_PERMISSIONS) {";
const patched = "if (platform() !== 'win32' && (stat.mode & BIN_PERMISSIONS) !== BIN_PERMISSIONS) {";
if (source.includes(patched)) process.exit(0);
if (!source.includes(original)) throw new Error("embedded-postgres executable check changed; review patch");
fs.writeFileSync(file, source.replace(original, patched));
