import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "dist-desktop");
const { name: appName, version } = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
const packages = fs.readdirSync(dir).filter((name) => /\.(dmg|exe)$/.test(name));
for (const source of packages) {
  const target = source.endsWith(".dmg")
    ? `${appName}-${version}-macos-${source.includes("arm64") ? "arm64" : "x64"}.dmg`
    : `${appName}-${version}-windows-x64-${source.toLowerCase().includes("setup") ? "setup" : "portable"}.exe`;
  if (source !== target) {
    if (fs.existsSync(path.join(dir, target))) throw new Error(`Duplicate desktop package: ${target}`);
    fs.renameSync(path.join(dir, source), path.join(dir, target));
  }
}
const names = fs.readdirSync(dir).filter((name) => /\.(dmg|exe)$/.test(name)).sort();
if (!names.length) throw new Error("No desktop packages found");
const lines = names.map((name) => {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, name))).digest("hex");
  return `${hash}  ${name}`;
});
fs.writeFileSync(path.join(dir, "SHA256SUMS.txt"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
