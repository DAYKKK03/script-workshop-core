UPDATE "ExtractionJob"
SET
    "sourceUrl" = NULL,
    "transcript" = NULL,
    "status" = 'failed',
    "errorCode" = COALESCE("errorCode", 'EXTRACTION_JOB_SANITIZED')
WHERE "sourceUrl" IS NOT NULL
   OR "transcript" IS NOT NULL;
