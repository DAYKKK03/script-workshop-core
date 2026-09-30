import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const target = path.join(root, "desktop-bundle");
const source = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(source, "server.js"))) throw new Error("Run npm run build first");
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, path.join(target, "server"), { recursive: true });
fs.cpSync(path.join(root, ".next", "static"), path.join(target, "server", ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public"))) fs.cpSync(path.join(root, "public"), path.join(target, "server", "public"), { recursive: true });
fs.cpSync(path.join(root, "prisma"), path.join(target, "prisma"), { recursive: true });

for (const [name, entry] of [
  ["extraction", "extraction-worker.ts"],
  ["topic", "topic-worker.ts"],
  ["custom-script", "custom-script-worker.ts"]
]) {
  await build({
    entryPoints: [path.join(root, "worker", entry)],
    outfile: path.join(target, "server", `worker-${name}.cjs`),
    bundle: true, platform: "node", format: "cjs", target: "node22",
    external: ["@prisma/client", "sharp", "ffmpeg-static"],
    logLevel: "warning"
  });
}
for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  if (fs.existsSync(path.join(target, "server", file))) throw new Error(`Forbidden packaged file: ${file}`);
}
console.log(`Desktop bundle ready: ${target}`);
