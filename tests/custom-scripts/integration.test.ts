import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parseCustomScriptQualityFallback } from "../../lib/custom-scripts/quality-fallback";
import type { CustomScriptProvider } from "../../lib/custom-scripts/service-runtime";
import { assertIsolatedTestDatabaseUrl } from "../helpers/test-database";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (testDatabaseUrl) assertIsolatedTestDatabaseUrl(testDatabaseUrl, process.env.DATABASE_URL);

function exactLengthScript(count: number) {
  const lineCount = Math.ceil(count / 25);
  const baseLength = Math.floor(count / lineCount);
  let remainder = count % lineCount;
  return Array.from({ length: lineCount }, () => {
    const lineLength = baseLength + (remainder-- > 0 ? 1 : 0);
    const prefix = "附近上班族下午茶";
    return `${prefix}${"真".repeat(lineLength - Array.from(prefix).length - 1)}。`;
  }).join("\n");
}

function exactFifteenLineScript(count: number) {
  const lineCount = 15;
  const baseLength = Math.floor(count / lineCount);
  let remainder = count % lineCount;
  return Array.from({ length: lineCount }, () => {
    const lineLength = baseLength + (remainder-- > 0 ? 1 : 0);
    const prefix = "下午茶";
    return `${prefix}${"真".repeat(lineLength - Array.from(prefix).length - 1)}。`;
  }).join("\n");
}

test("custom script jobs preserve idempotency, quota, cancellation, and stale-lease ownership", {
  skip: testDatabaseUrl ? false : "TEST_DATABASE_URL is required"
}, async () => {
  if (!testDatabaseUrl) return;
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.RATE_LIMIT_SECRET = "custom-script-integration-test-secret";
  const { prisma } = await import("../../lib/prisma");
  const {
    completeCustomScriptSuccess,
    createCustomScriptGenerationJob,
    CustomScriptGenerationJobError,
    getCustomScriptGenerationJobForUser,
    cancelCustomScriptGenerationJobForUser
  } = await import("../../lib/custom-scripts/jobs");
  const { claimNextCustomScriptJob } = await import("../../lib/custom-scripts/worker");
  const { processClaimedCustomScriptJob } = await import("../../lib/custom-scripts/job-runner");
  const runId = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      account: `custom_script_${runId}`,
      passwordHash: "integration-only",
      inviteCodeUsed: `custom_script_${runId}`,
      dailyScriptLimit: 5
    }
  });
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      projectName: "测试甜品店",
      profileText: "主营甜品，服务附近上班族下午茶。"
    }
  });
  const script = exactLengthScript(250);
  let providerCalls = 0;
  const provider = async () => {
    providerCalls += 1;
    return {
      status: "success" as const,
      content: JSON.stringify({ status: "success", finalScript: script }),
      diagnostic: { attempts: 1, thinkingMode: "disabled" as const }
    };
  };
  const body = (clientRequestId: string) => ({
    clientRequestId,
    projectId: project.id,
    requestText: "写一条面向附近上班族的下午茶口播",
    objective: "trust",
    tone: "natural"
  });

  try {
    const firstId = randomUUID();
    const first = await createCustomScriptGenerationJob({ userId: user.id, body: body(firstId) });
    const replay = await createCustomScriptGenerationJob({ userId: user.id, body: body(firstId) });
    assert.equal(replay.id, first.id);
    await assert.rejects(
      () => createCustomScriptGenerationJob({ userId: user.id, body: { ...body(firstId), tone: "professional" } }),
      (error: unknown) => error instanceof CustomScriptGenerationJobError && error.code === "CUSTOM_SCRIPT_IDEMPOTENCY_CONFLICT"
    );
    const claim = await claimNextCustomScriptJob("worker-a");
    assert.equal(claim?.id, first.id);
    assert.ok(claim);
    await processClaimedCustomScriptJob(claim.id, claim.leaseToken, provider);
    const completed = await getCustomScriptGenerationJobForUser(first.id, user.id);
    assert.equal(completed.status, "succeeded");
    assert.equal(completed.result?.status, "success");
    const completedRow = await prisma.customScriptGenerationJob.findUnique({ where: { id: first.id } });
    assert.equal(completedRow?.input, null);
    assert.equal(completedRow?.projectId, null);
    const usageAfterFirst = await prisma.dailyUsage.findFirst({ where: { userId: user.id } });
    assert.equal(usageAfterFirst?.scriptsGenerated, 1);
    const completedReplay = await createCustomScriptGenerationJob({ userId: user.id, body: body(firstId) });
    assert.equal(completedReplay.id, first.id);
    assert.equal(providerCalls, 1);
    assert.equal((await prisma.dailyUsage.findFirst({ where: { userId: user.id } }))?.scriptsGenerated, 1);

    const cancelJob = await createCustomScriptGenerationJob({ userId: user.id, body: body(randomUUID()) });
    await cancelCustomScriptGenerationJobForUser(cancelJob.id, user.id);
    assert.equal((await prisma.dailyUsage.findFirst({ where: { userId: user.id } }))?.scriptsGenerated, 1);

    const recoveredJob = await createCustomScriptGenerationJob({ userId: user.id, body: body(randomUUID()) });
    const oldClaim = await claimNextCustomScriptJob("worker-old");
    assert.equal(oldClaim?.id, recoveredJob.id);
    assert.ok(oldClaim);
    await prisma.customScriptGenerationJob.update({
      where: { id: recoveredJob.id },
      data: {
        providerCallsStarted: 1,
        semanticAttempt: 1,
        lockedAt: new Date(Date.now() - 31_000)
      }
    });
    const newClaim = await claimNextCustomScriptJob("worker-new");
    assert.equal(newClaim?.id, recoveredJob.id);
    assert.ok(newClaim);
    assert.notEqual(newClaim.leaseToken, oldClaim.leaseToken);
    const staleCompletion = await completeCustomScriptSuccess({
      jobId: recoveredJob.id,
      userId: user.id,
      leaseToken: oldClaim.leaseToken,
      result: { status: "success", finalScript: script, characterCount: 300, inputType: "brief" }
    });
    assert.equal(staleCompletion, "lease_lost");
    const recoveryRequests: Parameters<CustomScriptProvider>[0][] = [];
    await processClaimedCustomScriptJob(newClaim.id, newClaim.leaseToken, async (input) => {
      recoveryRequests.push(input);
      return provider();
    });
    assert.equal((await prisma.dailyUsage.findFirst({ where: { userId: user.id } }))?.scriptsGenerated, 2);
    const recovered = await prisma.customScriptGenerationJob.findUnique({ where: { id: recoveredJob.id } });
    assert.equal(recovered?.providerCallsStarted, 2);
    assert.equal(recoveryRequests.length, 1);
    const recoveryUserData = JSON.parse(recoveryRequests[0].messages.at(-1)?.content || "{}") as Record<string, unknown>;
    assert.equal("validatedDraft" in recoveryUserData, false);

    const quotaRaceJob = await createCustomScriptGenerationJob({ userId: user.id, body: body(randomUUID()) });
    const quotaRaceClaim = await claimNextCustomScriptJob("worker-quota-race");
    assert.equal(quotaRaceClaim?.id, quotaRaceJob.id);
    assert.ok(quotaRaceClaim);
    await prisma.user.update({ where: { id: user.id }, data: { dailyScriptLimit: 2 } });
    const quotaOutcome = await completeCustomScriptSuccess({
      jobId: quotaRaceJob.id,
      userId: user.id,
      leaseToken: quotaRaceClaim.leaseToken,
      result: { status: "success", finalScript: script, characterCount: 300, inputType: "brief" }
    });
    assert.equal(quotaOutcome, "daily_limit");
    const quotaFailed = await prisma.customScriptGenerationJob.findUnique({ where: { id: quotaRaceJob.id } });
    assert.equal(quotaFailed?.status, "failed");
    assert.equal(quotaFailed?.errorCode, "CUSTOM_SCRIPT_DAILY_LIMIT_REACHED");
    assert.equal(quotaFailed?.input, null);
    assert.equal(quotaFailed?.projectId, null);
    assert.equal((await prisma.dailyUsage.findFirst({ where: { userId: user.id } }))?.scriptsGenerated, 2);
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});

test("custom script worker enriches short safe drafts without risking success or double charging", {
  skip: testDatabaseUrl ? false : "TEST_DATABASE_URL is required"
}, async () => {
  if (!testDatabaseUrl) return;
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.RATE_LIMIT_SECRET = "custom-script-length-repair-test-secret";
  const { prisma } = await import("../../lib/prisma");
  const {
    createCustomScriptGenerationJob,
    getCustomScriptGenerationJobForUser
  } = await import("../../lib/custom-scripts/jobs");
  const { claimNextCustomScriptJob } = await import("../../lib/custom-scripts/worker");
  const { processClaimedCustomScriptJob } = await import("../../lib/custom-scripts/job-runner");
  const runId = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      account: `custom_length_${runId}`,
      passwordHash: "integration-only",
      inviteCodeUsed: `custom_length_${runId}`,
      dailyScriptLimit: 50
    }
  });
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      projectName: "长度修复甜品店",
      profileText: "主营甜品，服务附近上班族下午茶。"
    }
  });
  const requestBody = () => ({
    clientRequestId: randomUUID(),
    projectId: project.id,
    requestText: "写一条面向附近上班族的下午茶口播",
    objective: "trust",
    tone: "natural"
  });

  type SequenceItem = number | "provider_failed" | "invalid" | "needs_profile";

  async function runSequence(sequence: SequenceItem[], useFifteenLines = false) {
    const requests: Parameters<CustomScriptProvider>[0][] = [];
    let providerCall = 0;
    let createdId = "";
    let persistedBeforeRepair: ReturnType<typeof parseCustomScriptQualityFallback>;
    const provider: CustomScriptProvider = async (input) => {
      requests.push(input);
      const item = sequence[Math.min(providerCall, sequence.length - 1)];
      if (providerCall === 1 && createdId) {
        const row = await prisma.customScriptGenerationJob.findUnique({ where: { id: createdId } });
        persistedBeforeRepair = parseCustomScriptQualityFallback(row?.result);
      }
      providerCall += 1;
      if (item === "provider_failed") {
        return {
          status: "failed",
          errorCode: "AI_PROVIDER_FAILED",
          message: "safe",
          diagnostic: {
            providerSubreason: "network_error",
            attempts: 1,
            model: "test-model",
            baseHostPath: "example.test/v1"
          }
        };
      }
      if (item === "invalid") {
        return {
          status: "success",
          content: "{",
          diagnostic: { attempts: 1, thinkingMode: "disabled" }
        };
      }
      if (item === "needs_profile") {
        return {
          status: "success",
          content: JSON.stringify({ status: "needs_profile", missingFacts: ["core_selling_point"] }),
          diagnostic: { attempts: 1, thinkingMode: "disabled" }
        };
      }
      return {
        status: "success",
        content: JSON.stringify({
          status: "success",
          finalScript: useFifteenLines ? exactFifteenLineScript(item) : exactLengthScript(item)
        }),
        diagnostic: { attempts: 1, thinkingMode: "disabled" }
      };
    };
    const logs: string[] = [];
    const usageBefore = (await prisma.dailyUsage.findFirst({ where: { userId: user.id } }))?.scriptsGenerated || 0;
    const created = await createCustomScriptGenerationJob({ userId: user.id, body: requestBody() });
    createdId = created.id;
    const claim = await claimNextCustomScriptJob(`worker-${randomUUID()}`);
    assert.equal(claim?.id, created.id);
    assert.ok(claim);
    await processClaimedCustomScriptJob(claim.id, claim.leaseToken, provider, (line) => logs.push(line));
    return {
      requests,
      logs: logs.map((line) => JSON.parse(line) as Record<string, unknown>),
      job: await getCustomScriptGenerationJobForUser(created.id, user.id),
      row: await prisma.customScriptGenerationJob.findUnique({ where: { id: created.id } }),
      persistedBeforeRepair,
      usageBefore,
      usageAfter: (await prisma.dailyUsage.findFirst({ where: { userId: user.id } }))?.scriptsGenerated || 0
    };
  }

  try {
    for (const item of [
      { counts: [79, 150], direction: "short", bucket: "under_80" },
      { counts: [351, 150], direction: "long", bucket: "351_360" }
    ] as const) {
      const result = await runSequence([...item.counts], true);
      assert.equal(result.job.status, "succeeded");
      assert.equal(result.requests.length, 2);
      assert.equal(result.row?.providerCallsStarted, 2);
      const secondMessages = result.requests[1].messages;
      const secondPrompt = secondMessages.map((message) => message.content).join("\n");
      assert.match(secondPrompt, new RegExp(`服务端计数.{0,4}${item.counts[0]}`, "u"));
      const secondUserData = JSON.parse(secondMessages.at(-1)?.content || "{}") as Record<string, unknown>;
      assert.equal(secondUserData.repairMode, "fresh");
      assert.equal("validatedDraft" in secondUserData, false);
      assert.equal(secondUserData.serverCount, item.counts[0]);
      const validationLogs = result.logs.filter((entry) => entry.event === "custom_script_validation_invalid");
      assert.equal(validationLogs.length, 1);
      assert.equal(validationLogs[0].scriptLengthDirection, item.direction);
      assert.equal(validationLogs[0].scriptLengthBucket, item.bucket);
      assert.equal(validationLogs[0].lineCountBucket, "15_20");
      assert.equal("actualCount" in validationLogs[0], false);
      assert.equal("lineCount" in validationLogs[0], false);
      assert.equal("validatedDraft" in validationLogs[0], false);
      assert.equal(result.persistedBeforeRepair, undefined);
      assert.equal(JSON.stringify(result.job).includes(exactFifteenLineScript(item.counts[0])), false);
      assert.equal(JSON.stringify(result.row).includes(exactFifteenLineScript(item.counts[0])), false);
    }

    for (const [firstCount, secondCount] of [
      [80, 250],
      [150, 250],
      [199, 250]
    ] as const) {
      const result = await runSequence([firstCount, secondCount], true);
      assert.equal(result.job.status, "succeeded");
      assert.equal(result.job.result?.status, "success");
      assert.equal(result.job.result?.status === "success" ? result.job.result.characterCount : undefined, secondCount);
      assert.equal(result.requests.length, 2);
      assert.equal(result.row?.providerCallsStarted, 2);
      const secondUserData = JSON.parse(result.requests[1].messages.at(-1)?.content || "{}") as Record<string, unknown>;
      assert.equal(secondUserData.repairMode, "fresh");
      assert.equal("serverCount" in secondUserData, false);
      assert.match(String(secondUserData.repairInstruction), /质量增强/u);
      const firstTimeoutMs = result.requests[0]?.timeoutMs;
      const secondTimeoutMs = result.requests[1]?.timeoutMs;
      assert.equal(typeof firstTimeoutMs, "number");
      assert.equal(typeof secondTimeoutMs, "number");
      assert.ok((firstTimeoutMs || 0) - (secondTimeoutMs || 0) >= 30_000);
      assert.equal(JSON.stringify(result.requests[1]).includes(exactFifteenLineScript(firstCount)), false);
      assert.deepEqual(result.persistedBeforeRepair, {
        status: "quality_fallback",
        finalScript: exactFifteenLineScript(firstCount),
        characterCount: firstCount,
        inputType: "brief"
      });
      assert.equal(result.usageAfter - result.usageBefore, 1);
    }

    const shorterCandidate = await runSequence([150, 120], true);
    assert.equal(shorterCandidate.job.status, "succeeded");
    assert.equal(shorterCandidate.job.result?.status === "success" ? shorterCandidate.job.result.characterCount : undefined, 150);
    assert.equal(shorterCandidate.usageAfter - shorterCandidate.usageBefore, 1);

    for (const second of ["provider_failed", "invalid", "needs_profile"] as const) {
      const fallback = await runSequence([150, second], true);
      assert.equal(fallback.job.status, "succeeded");
      assert.equal(fallback.job.result?.status, "success");
      assert.equal(fallback.job.result?.status === "success" ? fallback.job.result.characterCount : undefined, 150);
      assert.equal(fallback.requests.length, 2);
      assert.equal(fallback.logs.some((entry) => entry.event === "custom_script_failed"), false);
      assert.equal(fallback.usageAfter - fallback.usageBefore, 1);
    }

    const usageBeforeFailure = (await prisma.dailyUsage.findFirst({ where: { userId: user.id } }))?.scriptsGenerated || 0;
    const failed = await runSequence([79, 79], true);
    assert.equal(failed.job.status, "failed");
    assert.equal(failed.job.errorCode, "CUSTOM_SCRIPT_OUTPUT_INVALID");
    assert.equal(failed.requests.length, 2);
    assert.equal(failed.row?.providerCallsStarted, 2);
    const validationLogs = failed.logs.filter((entry) => entry.event === "custom_script_validation_invalid");
    assert.equal(validationLogs.length, 2);
    assert.deepEqual(validationLogs.map((entry) => entry.semanticAttempt), [1, 2]);
    const terminalLog = failed.logs.find((entry) => entry.event === "custom_script_failed");
    assert.equal(terminalLog?.scriptLengthBucket, "under_80");
    assert.equal(terminalLog?.lineCountBucket, "15_20");
    assert.equal("actualCount" in (terminalLog || {}), false);
    assert.equal("lineCount" in (terminalLog || {}), false);
    assert.equal(failed.usageAfter, usageBeforeFailure);
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});

test("custom script quality fallback survives both crash windows and remains private", {
  skip: testDatabaseUrl ? false : "TEST_DATABASE_URL is required"
}, async () => {
  if (!testDatabaseUrl) return;
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.RATE_LIMIT_SECRET = "custom-script-fallback-recovery-test-secret";
  const { prisma } = await import("../../lib/prisma");
  const {
    cancelCustomScriptGenerationJobForUser,
    createCustomScriptGenerationJob,
    getCustomScriptGenerationJobForUser,
    persistCustomScriptQualityFallback
  } = await import("../../lib/custom-scripts/jobs");
  const { createCustomScriptQualityFallback } = await import("../../lib/custom-scripts/quality-fallback");
  const { claimNextCustomScriptJob } = await import("../../lib/custom-scripts/worker");
  const { processClaimedCustomScriptJob } = await import("../../lib/custom-scripts/job-runner");
  const runId = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      account: `custom_fallback_${runId}`,
      passwordHash: "integration-only",
      inviteCodeUsed: `custom_fallback_${runId}`,
      dailyScriptLimit: 20
    }
  });
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      projectName: "恢复测试甜品店",
      profileText: "主营甜品，服务附近上班族下午茶。"
    }
  });
  const shortScript = exactLengthScript(150);
  const fallback = createCustomScriptQualityFallback(shortScript, "brief");
  const createJob = () => createCustomScriptGenerationJob({
    userId: user.id,
    body: {
      clientRequestId: randomUUID(),
      projectId: project.id,
      requestText: "写一条面向附近上班族的下午茶口播",
      objective: "trust",
      tone: "natural"
    }
  });

  async function preparePersistedFallback(providerCallsStarted: 1 | 2) {
    const created = await createJob();
    const claim = await claimNextCustomScriptJob(`worker-before-crash-${randomUUID()}`);
    assert.equal(claim?.id, created.id);
    assert.ok(claim);
    await prisma.customScriptGenerationJob.update({
      where: { id: created.id },
      data: { providerCallsStarted: 1, semanticAttempt: 1 }
    });
    assert.equal(await persistCustomScriptQualityFallback({
      jobId: created.id,
      leaseToken: claim.leaseToken,
      fallback
    }), true);
    const processing = await getCustomScriptGenerationJobForUser(created.id, user.id);
    assert.equal(processing.status, "processing");
    assert.equal(processing.result, undefined);
    await prisma.customScriptGenerationJob.update({
      where: { id: created.id },
      data: {
        providerCallsStarted,
        semanticAttempt: providerCallsStarted,
        lockedAt: new Date(Date.now() - 31_000)
      }
    });
    return created;
  }

  try {
    const crashBeforeReservation = await preparePersistedFallback(1);
    const firstRecovery = await claimNextCustomScriptJob("worker-crash-a-recovery");
    assert.equal(firstRecovery?.id, crashBeforeReservation.id);
    assert.ok(firstRecovery);
    const recoveryRequests: Parameters<CustomScriptProvider>[0][] = [];
    await processClaimedCustomScriptJob(firstRecovery.id, firstRecovery.leaseToken, async (input) => {
      recoveryRequests.push(input);
      return {
        status: "success",
        content: JSON.stringify({ status: "success", finalScript: exactLengthScript(250) }),
        diagnostic: { attempts: 1, thinkingMode: "disabled" }
      };
    });
    assert.equal(recoveryRequests.length, 1);
    assert.equal(JSON.stringify(recoveryRequests[0]).includes(shortScript), false);
    const recoveredA = await getCustomScriptGenerationJobForUser(crashBeforeReservation.id, user.id);
    assert.equal(recoveredA.status, "succeeded");
    assert.equal(recoveredA.result?.status === "success" ? recoveredA.result.characterCount : undefined, 250);

    const crashAfterReservation = await preparePersistedFallback(2);
    const secondRecovery = await claimNextCustomScriptJob("worker-crash-b-recovery");
    assert.equal(secondRecovery?.id, crashAfterReservation.id);
    assert.ok(secondRecovery);
    let unexpectedProviderCalls = 0;
    await processClaimedCustomScriptJob(secondRecovery.id, secondRecovery.leaseToken, async () => {
      unexpectedProviderCalls += 1;
      throw new Error("A recovered exhausted fallback must not call the provider");
    });
    assert.equal(unexpectedProviderCalls, 0);
    const recoveredB = await getCustomScriptGenerationJobForUser(crashAfterReservation.id, user.id);
    assert.equal(recoveredB.status, "succeeded");
    assert.equal(recoveredB.result?.status === "success" ? recoveredB.result.characterCount : undefined, 150);

    const canceled = await preparePersistedFallback(1);
    await cancelCustomScriptGenerationJobForUser(canceled.id, user.id);
    assert.equal((await prisma.customScriptGenerationJob.findUnique({ where: { id: canceled.id } }))?.result, null);

    const malformed = await createJob();
    const malformedClaim = await claimNextCustomScriptJob("worker-malformed-before-crash");
    assert.equal(malformedClaim?.id, malformed.id);
    await prisma.customScriptGenerationJob.update({
      where: { id: malformed.id },
      data: {
        providerCallsStarted: 2,
        semanticAttempt: 2,
        result: { ...fallback, characterCount: 149 },
        lockedAt: new Date(Date.now() - 31_000)
      }
    });
    await claimNextCustomScriptJob("worker-malformed-recovery");
    const malformedRow = await prisma.customScriptGenerationJob.findUnique({ where: { id: malformed.id } });
    assert.equal(malformedRow?.status, "failed");
    assert.equal(malformedRow?.result, null);
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
