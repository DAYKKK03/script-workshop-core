import { getDeepSeekRuntimeSummary } from "@/lib/ai/deepseek-runtime";
import { stagingProbeExitCode } from "@/lib/custom-scripts/staging-probe-cli";
import { ProbeValidationError, runStagingSentenceProbeSeries } from "@/lib/custom-scripts/staging-sentence-probe";
import { prisma } from "@/lib/prisma";

async function loadFixedStagingProfile() {
  const project = await prisma.project.findFirst({
    where: {
      projectName: "小岛西点烘焙",
      user: { account: "测试-1" }
    },
    orderBy: { updatedAt: "desc" },
    select: { profileText: true }
  });
  return project?.profileText;
}

async function main() {
  const result = await runStagingSentenceProbeSeries({
    env: process.env,
    runtimeModel: getDeepSeekRuntimeSummary().model,
    merchantProjectName: "小岛西点烘焙",
    loadProfile: loadFixedStagingProfile
  });
  process.exitCode = stagingProbeExitCode(result);
}

void main()
  .catch((error: unknown) => {
    const validationReason = error instanceof ProbeValidationError ? error.reason : "provider_failed";
    process.stdout.write(`${JSON.stringify({ gate: false, runsCompleted: 0, validationReason })}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
