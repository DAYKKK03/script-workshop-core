import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { classifyExtractionWorkerVerificationFailure } from "./verify-functional-classification";
export {
  classifyExtractionWorkerVerificationFailure,
  extractionWorkerVerificationFailureCodes,
  type ExtractionWorkerVerificationFailureCode
} from "./verify-functional-classification";

const probeAccountPrefix = "worker_functional_probe_";
const pollIntervalMs = 100;
const timeoutMs = 15_000;


async function main() {
  const probeId = randomUUID();
  let user: { id: string };
  try { user = await prisma.user.create({
    data: {
      account: `${probeAccountPrefix}${probeId}`,
      passwordHash: "probe-only-password-hash",
      inviteCodeUsed: `${probeAccountPrefix}${probeId}`
    }
  }); } catch { throw "probe_setup_failed"; }

  try {
    let job;
    try { job = await prisma.extractionJob.create({
      data: {
        userId: user.id,
        sourceUrl: null,
        sourceHost: null,
        sourceHash: probeId.replaceAll("-", ""),
        status: "queued",
        maxAttempts: 1,
        availableAt: new Date(),
        expiresAt: new Date(Date.now() + timeoutMs)
      }
    }); } catch { throw "probe_setup_failed"; }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const current = await prisma.extractionJob.findUniqueOrThrow({
        where: { id: job.id }
      });
      if (current.status === "failed") {
        if (current.errorCode !== "EXTRACTION_SOURCE_EXPIRED") throw "terminal_error_code_mismatch";
        if (current.attemptCount !== 1) throw "attempt_count_mismatch";
        if (current.lockedAt !== null || current.lockedBy !== null) throw "lease_not_released";
        process.stdout.write("Worker functional verification passed\n");
        return;
      }
      if (current.status === "succeeded") throw "terminal_status_mismatch";
      await delay(pollIntervalMs);
    }
    throw "probe_timed_out";
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => { throw "probe_cleanup_failed"; });
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`extraction_worker_functional_failed:${classifyExtractionWorkerVerificationFailure(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
