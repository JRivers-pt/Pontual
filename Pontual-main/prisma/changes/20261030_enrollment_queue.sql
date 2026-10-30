-- Additive PostgreSQL change. Apply after backup, before enabling enrollment sync.
-- Do not run prisma migrate deploy: the repository's legacy migration history is SQLite.
BEGIN;
CREATE TABLE "EnrollmentTask" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "workno" TEXT NOT NULL,
  "terminalId" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL,
  "clearFingerprint" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "exportedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "EnrollmentTask_userId_workno_terminalId_key" ON "EnrollmentTask"("userId", "workno", "terminalId");
CREATE INDEX "EnrollmentTask_userId_status_nextAttemptAt_idx" ON "EnrollmentTask"("userId", "status", "nextAttemptAt");
CREATE TABLE "EnrollmentAgent" (
  "userId" TEXT NOT NULL PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMIT;
