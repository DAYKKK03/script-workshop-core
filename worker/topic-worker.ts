import "dotenv/config";
import { prisma } from "../lib/prisma";
import { runTopicWorker, verifyTopicWorkerRuntime } from "../lib/topics/worker";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

const task = process.argv.includes("--check")
  ? verifyTopicWorkerRuntime().then(() => { process.stdout.write("Topic Worker functional check passed\n"); })
  : runTopicWorker({ signal: controller.signal });

task
  .catch(() => { process.stderr.write("Topic Worker startup or runtime check failed\n"); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
