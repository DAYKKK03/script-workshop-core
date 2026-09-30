import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "dist-desktop");
const names = fs.readdirSync(dir).filter((name) => /\.(dmg|exe)$/.test(name)).sort();
if (!names.length) throw new Error("No desktop packages found");
const lines = names.map((name) => {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, name))).digest("hex");
  return `${hash}  ${name}`;
});
fs.writeFileSync(path.join(dir, "SHA256SUMS.txt"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
