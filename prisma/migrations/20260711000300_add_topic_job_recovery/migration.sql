ALTER TYPE "TopicGenerationJobStatus" ADD VALUE IF NOT EXISTS 'canceled';

ALTER TABLE "TopicGenerationJob"
ADD COLUMN "runDeadlineAt" TIMESTAMP(3);

UPDATE "TopicGenerationJob"
SET "runDeadlineAt" = LEAST("expiresAt", "createdAt" + INTERVAL '5 minutes')
WHERE "runDeadlineAt" IS NULL;

ALTER TABLE "TopicGenerationJob"
ALTER COLUMN "runDeadlineAt" SET NOT NULL;

CREATE INDEX "TopicGenerationJob_status_runDeadlineAt_idx"
ON "TopicGenerationJob"("status", "runDeadlineAt");
