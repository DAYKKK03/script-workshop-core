import "dotenv/config";
import { prisma } from "../lib/prisma";
import { runExtractionWorker } from "../lib/douyin/extraction-worker";

const controller = new AbortController();

process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

runExtractionWorker({ signal: controller.signal })
  .catch(() => {
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
