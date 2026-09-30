CREATE TYPE "CustomScriptGenerationJobStatus" AS ENUM (
    'queued',
    'processing',
    'succeeded',
    'needs_profile',
    'failed',
    'canceled'
);

CREATE TABLE "CustomScriptGenerationJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "input" JSONB,
    "result" JSONB,
    "status" "CustomScriptGenerationJobStatus" NOT NULL DEFAULT 'queued',
    "errorCode" TEXT,
    "providerCallsStarted" INTEGER NOT NULL DEFAULT 0,
    "semanticAttempt" INTEGER NOT NULL DEFAULT 0,
    "quotaChargedAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "runDeadlineAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "CustomScriptGenerationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomScriptGenerationJob_userId_status_idx" ON "CustomScriptGenerationJob"("userId", "status");
CREATE INDEX "CustomScriptGenerationJob_status_availableAt_idx" ON "CustomScriptGenerationJob"("status", "availableAt");
CREATE INDEX "CustomScriptGenerationJob_status_lockedAt_idx" ON "CustomScriptGenerationJob"("status", "lockedAt");
CREATE INDEX "CustomScriptGenerationJob_status_runDeadlineAt_idx" ON "CustomScriptGenerationJob"("status", "runDeadlineAt");
CREATE INDEX "CustomScriptGenerationJob_expiresAt_idx" ON "CustomScriptGenerationJob"("expiresAt");
CREATE UNIQUE INDEX "CustomScriptGenerationJob_userId_clientRequestId_key" ON "CustomScriptGenerationJob"("userId", "clientRequestId");

-- A partial unique index closes the race that a Serializable count check alone
-- cannot prevent when two requests create different UUIDs simultaneously.
CREATE UNIQUE INDEX "CustomScriptGenerationJob_one_active_per_user_key"
ON "CustomScriptGenerationJob"("userId")
WHERE "status" IN ('queued', 'processing');

ALTER TABLE "CustomScriptGenerationJob"
ADD CONSTRAINT "CustomScriptGenerationJob_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomScriptGenerationJob"
ADD CONSTRAINT "CustomScriptGenerationJob_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
