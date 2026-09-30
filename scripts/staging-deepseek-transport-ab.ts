import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const endpoint = "https://api.deepseek.com/chat/completions";
const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
const timeoutMs = 20_000;
const syntheticPrompt = `Return one valid JSON object with keys ok and summary. Synthetic filler only; no merchant information. ${"synthetic content ".repeat(180)}`;

type Meta = { transport: string; statusClass: string; contentTypeClass: string; transferClass: string; bodyLengthBucket: string; jsonParsed: boolean; durationMs: number };
function bucket(n: number) { return n === 0 ? "0" : n < 256 ? "1-255" : n < 2048 ? "256-2047" : n < 8192 ? "2048-8191" : "8192+"; }
function typeClass(v: string | null | undefined) { const t = (v || "").toLowerCase(); return t.includes("json") ? "json" : t.includes("html") ? "html" : t.startsWith("text/") ? "text" : t ? "other" : "unknown"; }
function statusClass(status: number) { return status >= 200 && status < 300 ? "2xx" : status >= 500 ? "5xx" : status >= 400 ? "4xx" : "other"; }
function parsed(body: string) { try { JSON.parse(body); return true; } catch { return false; } }
function payload() { return JSON.stringify({ model, messages: [{ role: "system", content: "Return JSON only." }, { role: "user", content: syntheticPrompt }], response_format: { type: "json_object" }, temperature: 0, max_tokens: 2500 }); }

async function runFetch(closeConnection: boolean): Promise<Meta> {
  const started = Date.now();
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY || ""}`, "Content-Type": "application/json", ...(closeConnection ? { Connection: "close" } : {}) }, body: payload(), signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.text();
  const transfer = response.headers.get("transfer-encoding")?.toLowerCase() === "chunked" ? "chunked" : response.headers.has("content-length") ? "content_length" : "unknown";
  return { transport: closeConnection ? "node_fetch_connection_close" : "node_fetch_default", statusClass: statusClass(response.status), contentTypeClass: typeClass(response.headers.get("content-type")), transferClass: transfer, bodyLengthBucket: bucket(Buffer.byteLength(body)), jsonParsed: parsed(body), durationMs: Date.now() - started };
}

async function runCurl(directory: string): Promise<Meta> {
  const bodyPath = path.join(directory, "body.json");
  const headerPath = path.join(directory, "headers.txt");
  await writeFile(bodyPath, payload(), { mode: 0o600 });
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn("curl", ["--http1.1", "--silent", "--show-error", "--max-time", String(timeoutMs / 1000), endpoint, "-X", "POST", "-H", "Content-Type: application/json", "-H", "Connection: close", "-H", `Authorization: Bearer ${process.env.DEEPSEEK_API_KEY || ""}`, "--data-binary", `@${bodyPath}`, "-D", headerPath, "-o", "-", "-w", "\\n__STATUS__%{http_code}"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    child.once("close", async () => {
      const [body, statusText] = out.split("\\n__STATUS__");
      const status = Number.parseInt(statusText || "", 10);
      const headers = await BunlessRead(headerPath);
      const contentType = headers.match(/content-type:\s*([^\\r\\n]+)/i)?.[1];
      const transfer = /transfer-encoding:\s*chunked/i.test(headers) ? "chunked" : /content-length:/i.test(headers) ? "content_length" : "unknown";
      resolve({ transport: "curl_http1_close", statusClass: Number.isFinite(status) ? statusClass(status) : "network_error", contentTypeClass: typeClass(contentType), transferClass: transfer, bodyLengthBucket: bucket(Buffer.byteLength(body || "")), jsonParsed: parsed(body || ""), durationMs: Date.now() - started });
    });
  });
}
async function BunlessRead(file: string) { try { return await (await import("node:fs/promises")).readFile(file, "utf8"); } catch { return ""; } }

async function main() {
  if (!process.env.DEEPSEEK_API_KEY) { console.log(JSON.stringify({ keyStatus: "missing", model })); return; }
  const directory = await mkdtemp(path.join(os.tmpdir(), "deepseek-transport-ab-"));
  try { const results = [await runFetch(false), await runFetch(true), await runCurl(directory)]; console.log(JSON.stringify({ event: "deepseek_transport_ab", model, promptLengthBucket: bucket(Buffer.byteLength(syntheticPrompt)), maxTokens: 2500, results })); } finally { await rm(directory, { recursive: true, force: true }); }
}
void main().catch((error: unknown) => { console.log(JSON.stringify({ event: "deepseek_transport_ab", model, errorClass: error instanceof Error ? error.name : "unknown" })); });
