import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { Secret, TOTP } from "otpauth";
import { encryptTotpSecret, generateRecoveryCodes, hashRecoveryCode } from "../../lib/admin/security";
import { hashPassword } from "../../lib/auth/password";
import { createOpaqueSessionToken, hashSessionToken } from "../../lib/auth/session-token";
import { getShanghaiUsageDate } from "../../lib/usage/policy";
import {
  acquireWorkerTestLock,
  releaseWorkerTestLock
} from "../douyin/worker-test-lock";
import {
  classifyBootstrapFailure,
  isAllowedStagingBaseUrl,
  readStagingAdminRuntimeConfig
} from "./admin-runtime-policy";
import { assertIsolatedTestDatabaseUrl } from "../helpers/test-database";

const runtimeConfig = readStagingAdminRuntimeConfig(process.env);
if (runtimeConfig.enabled) {
  assertIsolatedTestDatabaseUrl(runtimeConfig.databaseUrl, process.env.DATABASE_URL);
}

test("staging runtime enforces administrator, session, ownership, quota, and usage boundaries", {
  skip: runtimeConfig.enabled
    ? false
    : `required staging test configuration is missing: ${runtimeConfig.missing.join(", ")}`
}, async () => {
  assert.equal(runtimeConfig.enabled, true);
  if (!runtimeConfig.enabled) return;

  const {
    databaseUrl,
    baseUrl,
    originSecret,
    adminMfaEncryptionKey,
    adminRecoveryCodePepper
  } = runtimeConfig;
  assert.equal(isAllowedStagingBaseUrl(baseUrl), true);
  assert.equal(Buffer.from(adminMfaEncryptionKey, "base64").length, 32);
  assert.ok(adminRecoveryCodePepper.length >= 32);

  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$connect();
  // This test seeds processing extraction jobs for its concurrency-limit
  // assertion, so it must stay mutually exclusive with the worker
  // integration tests that spawn real workers against the same database.
  await acquireWorkerTestLock(databaseUrl);
  const { assertDailyScriptQuota, DailyScriptLimitError } = await import(
    "../../lib/usage/service"
  );
  const { prisma: sharedPrisma } = await import("../../lib/prisma");
  const api = (path: string, token: string, init: RequestInit = {}) =>
    request(baseUrl, originSecret, path, `svs_admin_session=${token}`, init);
  const userApi = (
    path: string,
    token: string,
    init: RequestInit & { origin?: string } = {}
  ) => {
    const { origin, ...requestInit } = init;
    return request(
      baseUrl,
      originSecret,
      path,
      `svs_session=${token}`,
      requestInit,
      origin
    );
  };

  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const prefix = `p119_runtime_${runId}`;
  const provisionDirectory = await mkdtemp(join(tmpdir(), "p119-admin-"));
  const provisionFile = join(provisionDirectory, "owner.provision.json");
  const ownerAccount = `${prefix}_owner`;
  const ownerPassword = `P1!${randomUUID()}x`;
  const operatorSecret = new Secret({ size: 20 }).base32;
  const generatedInviteCodes: string[] = [];
  let ownerId = "";
  let operatorId = "";
  let firstUserId = "";
  let secondUserId = "";

  try {
    const bootstrap = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/bootstrap-admin.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          ADMIN_MFA_ENCRYPTION_KEY: adminMfaEncryptionKey,
          ADMIN_RECOVERY_CODE_PEPPER: adminRecoveryCodePepper,
          BOOTSTRAP_ADMIN_ACCOUNT: ownerAccount,
          BOOTSTRAP_ADMIN_PASSWORD: ownerPassword,
          BOOTSTRAP_ADMIN_OUTPUT_FILE: provisionFile
        },
        encoding: "utf8"
      }
    );
    const bootstrapFailureCode = classifyBootstrapFailure(
      `${bootstrap.stdout || ""}\n${bootstrap.stderr || ""}`
    );
    assert.equal(
      bootstrap.status,
      0,
      `administrator bootstrap failed: ${bootstrapFailureCode}`
    );
    assert.equal((await stat(provisionFile)).mode & 0o777, 0o600);

    const provision = JSON.parse(await readFile(provisionFile, "utf8")) as {
      provisioningUri: string;
      recoveryCodes: string[];
    };
    assert.ok(provision.recoveryCodes.length > 0);
    const ownerSecret = new URL(provision.provisioningUri).searchParams.get("secret");
    assert.ok(ownerSecret);
    await unlink(provisionFile);

    const owner = await prisma.adminUser.findUniqueOrThrow({ where: { account: ownerAccount } });
    ownerId = owner.id;
    const operatorRecoveryCodes = generateRecoveryCodes();
    const operator = await prisma.adminUser.create({
      data: {
        account: `${prefix}_operator`,
        passwordHash: await hashPassword(`P1!${randomUUID()}x`),
        totpSecretEncrypted: encryptTotpSecret(
          operatorSecret,
          adminMfaEncryptionKey
        ),
        role: "OPERATOR",
        recoveryCodes: {
          create: operatorRecoveryCodes.map((code) => ({
            codeHash: hashRecoveryCode(code, adminRecoveryCodePepper)
          }))
        }
      }
    });
    operatorId = operator.id;

    const ownerToken = await createAdminSession(prisma, owner.id);
    const operatorToken = await createAdminSession(prisma, operator.id);
    const expiredToken = await createAdminSession(prisma, owner.id, {
      expiresAt: new Date(Date.now() - 1_000)
    });
    const revokedToken = await createAdminSession(prisma, operator.id, {
      revokedAt: new Date()
    });

    const firstUserToken = createOpaqueSessionToken();
    const secondUserToken = createOpaqueSessionToken();
    const firstUser = await prisma.user.create({
      data: {
        account: `${prefix}_user_a`,
        passwordHash: "runtime-only-hash",
        inviteCodeUsed: `${prefix}_used_a`,
        dailyScriptLimit: 1,
        dailyTopicLimit: 5,
        sessions: {
          create: {
            tokenHash: hashSessionToken(firstUserToken),
            expiresAt: new Date(Date.now() + 60_000)
          }
        }
      }
    });
    firstUserId = firstUser.id;
    const secondUser = await prisma.user.create({
      data: {
        account: `${prefix}_user_b`,
        passwordHash: "runtime-only-hash",
        inviteCodeUsed: `${prefix}_used_b`,
        sessions: {
          create: {
            tokenHash: hashSessionToken(secondUserToken),
            expiresAt: new Date(Date.now() + 60_000)
          }
        }
      }
    });
    secondUserId = secondUser.id;
    const firstProject = await prisma.project.create({
      data: { userId: firstUser.id, projectName: "runtime", profileText: "runtime profile" }
    });

    await prisma.inviteCode.createMany({
      data: [
        { code: `${prefix}_unused`, status: "unused" },
        { code: `${prefix}_used`, status: "used", usedByUserId: firstUser.id, usedAt: new Date() },
        { code: `${prefix}_disabled`, status: "disabled" }
      ]
    });
    await prisma.dailyUsage.create({
      data: {
        userId: firstUser.id,
        usageDate: getShanghaiUsageDate(),
        scriptsGenerated: 1,
        topicIdeasGenerated: 1,
        deepseekRequests: 2,
        deepseekInputTokens: 100,
        deepseekOutputTokens: 50,
        tikhubRequests: 1,
        asrJobs: 1,
        asrAudioSeconds: 30,
        estimatedCostMicros: 25
      }
    });

    assert.equal((await api("/api/admin/admins", ownerToken)).status, 200);
    assert.equal((await api("/api/admin/admins", operatorToken)).status, 403);
    assert.equal((await api("/api/admin/overview", expiredToken)).status, 401);
    assert.equal((await api("/api/admin/overview", revokedToken)).status, 401);

    const inviteResponse = await api("/api/admin/invites", operatorToken, {
      method: "POST",
      body: JSON.stringify({ count: 1 })
    });
    assert.equal(inviteResponse.status, 201);
    const invitePayload = await inviteResponse.json() as { data: { codes: string[] } };
    generatedInviteCodes.push(...invitePayload.data.codes);
    assert.equal((await api("/api/admin/audit", ownerToken)).status, 200);

    const ownerTotp = new TOTP({ secret: ownerSecret! }).generate();
    const updateResponse = await api("/api/admin/accounts", ownerToken, {
      method: "PATCH",
      body: JSON.stringify({
        userId: firstUser.id,
        dailyScriptLimit: 1,
        dailyTopicLimit: 5,
        status: "active",
        revokeSessions: true,
        totpCode: ownerTotp
      })
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await userApi("/api/auth/me", firstUserToken)).status, 401);

    const freshFirstUserToken = createOpaqueSessionToken();
    await prisma.userSession.create({
      data: {
        userId: firstUser.id,
        tokenHash: hashSessionToken(freshFirstUserToken),
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    assert.equal(
      (await userApi(`/api/projects/${firstProject.id}`, secondUserToken)).status,
      404
    );
    assert.equal(
      (await userApi("/api/projects", freshFirstUserToken, {
        method: "POST",
        origin: "http://invalid.local",
        body: JSON.stringify({ projectName: "blocked", profileText: "blocked" })
      })).status,
      403
    );

    await prisma.extractionJob.createMany({
      data: [1, 2].map((index) => ({
        userId: firstUser.id,
        projectId: firstProject.id,
        status: "processing" as const,
        sourceHash: `${prefix}_${index}`,
        lockedAt: new Date(),
        lockedBy: `${prefix}_worker`,
        expiresAt: new Date(Date.now() + 60_000)
      }))
    });
    const source = ["https://", "v.douyin.com/", `${runId}/`].join("");
    const concurrencyResponse = await userApi("/api/douyin/extraction-jobs", freshFirstUserToken, {
      method: "POST",
      body: JSON.stringify({ projectId: firstProject.id, douyinUrl: source })
    });
    assert.equal(concurrencyResponse.status, 429);

    await assert.rejects(() => assertDailyScriptQuota(firstUser.id), DailyScriptLimitError);
    const overviewResponse = await api("/api/admin/overview", ownerToken);
    assert.equal(overviewResponse.status, 200);
    const overview = await overviewResponse.json() as {
      data: { today: Record<string, number>; invites: Record<string, number> }
    };
    assert.ok(overview.data.today.scriptsGenerated >= 1);
    assert.ok(overview.data.today.deepseekRequests >= 2);
    assert.ok(overview.data.today.asrAudioSeconds >= 30);
    assert.ok(overview.data.invites.unused >= 1);
    assert.ok(overview.data.invites.used >= 1);
    assert.ok(overview.data.invites.disabled >= 1);
  } finally {
    try {
      if (ownerId || operatorId) {
        await prisma.adminAuditLog.deleteMany({
          where: { adminId: { in: [ownerId, operatorId].filter(Boolean) } }
        }).catch(() => undefined);
      }
      await prisma.adminUser.deleteMany({ where: { id: { in: [ownerId, operatorId].filter(Boolean) } } });
      await prisma.inviteCode.deleteMany({
        where: {
          OR: [
            { code: { startsWith: prefix } },
            generatedInviteCodes.length ? { code: { in: generatedInviteCodes } } : { code: "__none__" }
          ]
        }
      });
      await prisma.user.deleteMany({ where: { id: { in: [firstUserId, secondUserId].filter(Boolean) } } });
      await prisma.rateLimitBucket.deleteMany();
    } finally {
      await Promise.allSettled([
        releaseWorkerTestLock(),
        prisma.$disconnect(),
        sharedPrisma.$disconnect(),
        rm(provisionDirectory, { recursive: true, force: true })
      ]);
    }
  }
});

async function createAdminSession(
  prisma: PrismaClient,
  adminId: string,
  overrides: { expiresAt?: Date; revokedAt?: Date } = {}
) {
  const token = createOpaqueSessionToken();
  await prisma.adminSession.create({
    data: {
      adminId,
      tokenHash: hashSessionToken(token),
      mfaVerifiedAt: new Date(),
      expiresAt: overrides.expiresAt || new Date(Date.now() + 60_000),
      revokedAt: overrides.revokedAt
    }
  });
  return token;
}

function request(
  baseUrl: string,
  originSecret: string,
  path: string,
  cookie: string,
  init: RequestInit,
  origin = "http://localhost:8080"
) {
  const headers = new Headers(init.headers);
  headers.set("X-EdgeOne-Origin-Verify", originSecret!);
  headers.set("Cookie", cookie);
  if (init.method && init.method !== "GET") {
    headers.set("Content-Type", "application/json");
    headers.set("Origin", origin);
  }
  return fetch(new URL(path, baseUrl), { ...init, headers, redirect: "manual" });
}
