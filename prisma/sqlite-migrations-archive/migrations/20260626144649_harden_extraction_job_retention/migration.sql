-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExtractionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "sourceUrl" TEXT,
    "sourceHost" TEXT,
    "sourceHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorCode" TEXT,
    "transcript" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME,
    CONSTRAINT "ExtractionJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExtractionJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExtractionJob" ("createdAt", "errorCode", "expiresAt", "id", "projectId", "sourceUrl", "status", "transcript", "updatedAt", "userId") SELECT "createdAt", "errorCode", "expiresAt", "id", "projectId", "sourceUrl", "status", "transcript", "updatedAt", "userId" FROM "ExtractionJob";
DROP TABLE "ExtractionJob";
ALTER TABLE "new_ExtractionJob" RENAME TO "ExtractionJob";
CREATE INDEX "ExtractionJob_userId_idx" ON "ExtractionJob"("userId");
CREATE INDEX "ExtractionJob_projectId_idx" ON "ExtractionJob"("projectId");
CREATE INDEX "ExtractionJob_status_idx" ON "ExtractionJob"("status");
CREATE INDEX "ExtractionJob_expiresAt_idx" ON "ExtractionJob"("expiresAt");
CREATE INDEX "ExtractionJob_sourceHash_idx" ON "ExtractionJob"("sourceHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
