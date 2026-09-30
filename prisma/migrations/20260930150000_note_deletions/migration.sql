-- Deleting a received, issue or transfer note keeps its rows: they point at a Deletion record
-- and stop counting. Nothing existing is changed; every current row stays live (deletionId NULL).

-- CreateTable
CREATE TABLE "Deletion" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refNo" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "removedRows" JSONB,
    "userId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deletion_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "StockLog" ADD COLUMN     "deletionId" TEXT;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "deletionId" TEXT;

-- CreateIndex
CREATE INDEX "StockLog_deletionId_idx" ON "StockLog"("deletionId");

-- CreateIndex
CREATE INDEX "Transfer_deletionId_idx" ON "Transfer"("deletionId");

-- AddForeignKey
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_deletionId_fkey" FOREIGN KEY ("deletionId") REFERENCES "Deletion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_deletionId_fkey" FOREIGN KEY ("deletionId") REFERENCES "Deletion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deletion" ADD CONSTRAINT "Deletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deletion" ADD CONSTRAINT "Deletion_restoredById_fkey" FOREIGN KEY ("restoredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
