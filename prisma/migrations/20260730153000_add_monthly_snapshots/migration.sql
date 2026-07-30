CREATE TABLE "DomainMonthlySnapshot" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "activeVersionId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DomainMonthlySnapshot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DomainMonthlySnapshotVersion" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "monthlyTasksCount" INTEGER NOT NULL,
    "backlogCount" INTEGER NOT NULL,
    "ideasCount" INTEGER NOT NULL,
    "versionType" TEXT NOT NULL DEFAULT 'system',
    "createdByUserId" TEXT NOT NULL DEFAULT '',
    "createdByUsername" TEXT NOT NULL DEFAULT '',
    "sourceVersionId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DomainMonthlySnapshotVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DomainMonthlySnapshot_domainId_monthKey_key" ON "DomainMonthlySnapshot"("domainId", "monthKey");
CREATE INDEX "DomainMonthlySnapshot_domainId_monthKey_idx" ON "DomainMonthlySnapshot"("domainId", "monthKey");
CREATE UNIQUE INDEX "DomainMonthlySnapshotVersion_snapshotId_versionNumber_key" ON "DomainMonthlySnapshotVersion"("snapshotId", "versionNumber");
CREATE INDEX "DomainMonthlySnapshotVersion_snapshotId_createdAt_idx" ON "DomainMonthlySnapshotVersion"("snapshotId", "createdAt");
ALTER TABLE "DomainMonthlySnapshot" ADD CONSTRAINT "DomainMonthlySnapshot_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DomainMonthlySnapshotVersion" ADD CONSTRAINT "DomainMonthlySnapshotVersion_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "DomainMonthlySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
