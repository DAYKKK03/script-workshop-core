CREATE TYPE "TopicGenerationJobStatus" AS ENUM ('queued', 'processing', 'succeeded', 'failed');

CREATE TABLE "TopicGenerationJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "input" JSONB,
    "result" JSONB,
    "status" "TopicGenerationJobStatus" NOT NULL DEFAULT 'queued',
    "errorCode" TEXT,
    "quotaChargedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TopicGenerationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TopicGenerationJob_userId_status_idx" ON "TopicGenerationJob"("userId", "status");
CREATE INDEX "TopicGenerationJob_status_availableAt_idx" ON "TopicGenerationJob"("status", "availableAt");
CREATE INDEX "TopicGenerationJob_status_lockedAt_idx" ON "TopicGenerationJob"("status", "lockedAt");
CREATE INDEX "TopicGenerationJob_expiresAt_idx" ON "TopicGenerationJob"("expiresAt");
CREATE UNIQUE INDEX "TopicGenerationJob_userId_clientRequestId_key" ON "TopicGenerationJob"("userId", "clientRequestId");
ALTER TABLE "TopicGenerationJob" ADD CONSTRAINT "TopicGenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TopicGenerationJob" ADD CONSTRAINT "TopicGenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
