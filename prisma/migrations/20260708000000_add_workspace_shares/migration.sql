-- CreateTable
CREATE TABLE "WorkspaceShare" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceShare_workspaceId_userId_key" ON "WorkspaceShare"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "WorkspaceShare_userId_idx" ON "WorkspaceShare"("userId");

-- AddForeignKey
ALTER TABLE "WorkspaceShare" ADD CONSTRAINT "WorkspaceShare_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceShare" ADD CONSTRAINT "WorkspaceShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
