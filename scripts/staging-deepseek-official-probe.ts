import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const endpoint = "https://api.deepseek.com/chat/completions";
const models = ["deepseek-chat", "deepseek-v4-flash", "deepseek-v4-pro"];
const timeoutMs = 15_000;

type StatusClass = "2xx" | "4xx" | "5xx" | "timeout" | "network_error" | "not_run";
type ErrorCategory =
  | "none"
  | "auth"
  | "rate_limit"
  | "server_error"
  | "http_4xx"
  | "timeout"
  | "network_error"
  | "not_configured"
  | "transport_unavailable";

type ProbeResult = {
  transport: "curl" | "node_fetch";
  model: string;
  statusClass: StatusClass;
  errorCategory: ErrorCategory;
};

function buildPayload(model: string) {
  return JSON.stringify({
    model,
    messages: [
      {
        role: "system",
        content: "Return JSON only. Example JSON output: {}."
      },
      {
        role: "user",
        content: "Return an empty json object."
      }
    ],
    response_format: { type: "json_object" },
    max_tokens: 32,
    temperature: 0
  });
}

function classifyStatus(status: number): Pick<ProbeResult, "statusClass" | "errorCategory"> {
  if (status >= 200 && status <= 299) {
    return { statusClass: "2xx", errorCategory: "none" };
  }

  if (status === 401 || status === 403) {
    return { statusClass: "4xx", errorCategory: "auth" };
  }

  if (status === 429) {
    return { statusClass: "4xx", errorCategory: "rate_limit" };
  }

  if (status >= 500 && status <= 599) {
    return { statusClass: "5xx", errorCategory: "server_error" };
  }

  return { statusClass: "4xx", errorCategory: "http_4xx" };
}

function escapeCurlConfig(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function runCurl(input: {
  apiKey: string;
  model: string;
  directory: string;
}): Promise<ProbeResult> {
  const payloadPath = path.join(input.directory, `${input.model}.json`);
  await writeFile(payloadPath, buildPayload(input.model), { mode: 0o600 });

  return new Promise((resolve) => {
    const child = spawn("curl", ["--config", "-"], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    let stdout = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({
        transport: "curl",
        model: input.model,
        statusClass: "not_run",
        errorCategory:
          error instanceof Error && error.name === "Error" && "code" in error && error.code === "ENOENT"
            ? "transport_unavailable"
            : "network_error"
      });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      const status = Number.parseInt(stdout.trim(), 10);

      if (Number.isFinite(status) && status > 0) {
        resolve({ transport: "curl", model: input.model, ...classifyStatus(status) });
        return;
      }

      resolve({
        transport: "curl",
        model: input.model,
        statusClass: code === 28 ? "timeout" : "network_error",
        errorCategory: code === 28 ? "timeout" : "network_error"
      });
    });

    child.stdin.end(
      [
        `url = "${endpoint}"`,
        "request = \"POST\"",
        "header = \"Content-Type: application/json\"",
        `header = "Authorization: Bearer ${escapeCurlConfig(input.apiKey)}"`,
        `data-binary = "@${escapeCurlConfig(payloadPath)}"`,
        "output = \"/dev/null\"",
        "write-out = \"%{http_code}\"",
        "max-time = 15",
        "silent",
        "show-error"
      ].join("\n")
    );
  });
}

async function runNodeFetch(input: {
  apiKey: string;
  model: string;
}): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json"
      },
      body: buildPayload(input.model),
      signal: controller.signal
    });

    return { transport: "node_fetch", model: input.model, ...classifyStatus(response.status) };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    return {
      transport: "node_fetch",
      model: input.model,
      statusClass: timeout ? "timeout" : "network_error",
      errorCategory: timeout ? "timeout" : "network_error"
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  const result = {
    deployedHead: process.env.PROBE_DEPLOYED_HEAD || "missing",
    officialHostPath: "api.deepseek.com/chat/completions",
    keyStatus: apiKey ? "exists" : "missing",
    results: [] as ProbeResult[]
  };

  if (!apiKey) {
    for (const model of models) {
      result.results.push(
        { transport: "curl", model, statusClass: "not_run", errorCategory: "not_configured" },
        { transport: "node_fetch", model, statusClass: "not_run", errorCategory: "not_configured" }
      );
    }
    console.log(JSON.stringify(result));
    return;
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), "deepseek-official-probe-"));

  try {
    for (const model of models) {
      result.results.push(await runCurl({ apiKey, model, directory }));
      result.results.push(await runNodeFetch({ apiKey, model }));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  console.log(JSON.stringify(result));
}

main().catch(() => {
  console.log(
    JSON.stringify({
      deployedHead: process.env.PROBE_DEPLOYED_HEAD || "missing",
      officialHostPath: "api.deepseek.com/chat/completions",
      keyStatus: process.env.DEEPSEEK_API_KEY?.trim() ? "exists" : "missing",
      results: []
    })
  );
});
