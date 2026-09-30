import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { MediaRelayConfig } from "./config";
import { sizeBucket } from "./download";

export type FfmpegDiagnostic = {
  outputSizeBucket?: string;
  durationBucket?: string;
};

export type FfmpegResult =
  | {
      status: "success";
      outputPath: string;
      bytes: number;
      format: "mp3";
      diagnostic: FfmpegDiagnostic;
    }
  | {
      status: "failed";
      reason:
        | "ffmpeg_not_available"
        | "ffmpeg_timeout"
        | "ffmpeg_failed"
        | "ffmpeg_output_missing"
        | "ffmpeg_output_too_large";
      diagnostic: FfmpegDiagnostic;
    };

export async function extractAudioWithFfmpeg({
  inputPath,
  workDir,
  config
}: {
  inputPath: string;
  workDir: string;
  config: Pick<
    MediaRelayConfig,
    "ffmpegPath" | "ffmpegTimeoutMs" | "maxDurationSeconds" | "maxOutputBytes"
  >;
}): Promise<FfmpegResult> {
  const outputPath = path.join(workDir, `${randomUUID()}.mp3`);
  const diagnostic: FfmpegDiagnostic = {
    durationBucket: `<=${config.maxDurationSeconds}s`
  };

  const result = await runFfmpeg({
    command: config.ffmpegPath,
    args: [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-map",
      "a:0",
      "-t",
      String(config.maxDurationSeconds),
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "64k",
      "-f",
      "mp3",
      outputPath
    ],
    timeoutMs: config.ffmpegTimeoutMs
  });

  if (result === "not_available") {
    return { status: "failed", reason: "ffmpeg_not_available", diagnostic };
  }

  if (result === "timeout") {
    return { status: "failed", reason: "ffmpeg_timeout", diagnostic };
  }

  if (result !== "success") {
    return { status: "failed", reason: "ffmpeg_failed", diagnostic };
  }

  const outputStat = await stat(outputPath).catch(() => undefined);

  if (!outputStat || outputStat.size <= 0) {
    return { status: "failed", reason: "ffmpeg_output_missing", diagnostic };
  }

  diagnostic.outputSizeBucket = sizeBucket(outputStat.size);

  if (outputStat.size > config.maxOutputBytes) {
    return { status: "failed", reason: "ffmpeg_output_too_large", diagnostic };
  }

  return {
    status: "success",
    outputPath,
    bytes: outputStat.size,
    format: "mp3",
    diagnostic
  };
}

function runFfmpeg({
  command,
  args,
  timeoutMs
}: {
  command: string;
  args: string[];
  timeoutMs: number;
}) {
  return new Promise<"success" | "failed" | "timeout" | "not_available">(
    (resolve) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "ignore", "ignore"]
      });
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        resolve("timeout");
      }, timeoutMs);

      child.on("error", (error: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(error.code === "ENOENT" ? "not_available" : "failed");
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(code === 0 ? "success" : "failed");
      });
    }
  );
}
