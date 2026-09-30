import "dotenv/config";
import { runCustomScriptWorker, verifyCustomScriptWorkerRuntime } from "../lib/custom-scripts/worker";
import { prisma } from "../lib/prisma";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

const task = process.argv.includes("--check")
  ? verifyCustomScriptWorkerRuntime().then(() => {
      process.stdout.write("Custom Script Worker functional check passed\n");
    })
  : runCustomScriptWorker({ signal: controller.signal });

task
  .catch(() => {
    process.stderr.write("Custom Script Worker startup or runtime check failed\n");
    process.exitCode = 1;
  })
  .finally(async () => { await prisma.$disconnect(); });
