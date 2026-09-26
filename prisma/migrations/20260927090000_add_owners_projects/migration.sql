-- CreateTable
CREATE TABLE "StockOwner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockOwner_name_key" ON "StockOwner"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");

-- Built-in "no owner" row; all existing stock belongs to it
INSERT INTO "StockOwner" ("id", "name") VALUES ('unassigned', 'Unassigned');

-- DropIndex
DROP INDEX "StockEntry_productId_storeId_key";

-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "ownerId" TEXT NOT NULL DEFAULT 'unassigned';

-- AlterTable
ALTER TABLE "StockLog" ADD COLUMN     "ownerId" TEXT NOT NULL DEFAULT 'unassigned',
ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ownerId" TEXT NOT NULL DEFAULT 'unassigned',
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "refNo" TEXT;

-- Existing transfers keep the date they were made
UPDATE "Transfer" SET "entryDate" = "createdAt";

-- CreateIndex
CREATE UNIQUE INDEX "StockEntry_productId_storeId_ownerId_key" ON "StockEntry"("productId", "storeId", "ownerId");

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "StockOwner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "StockOwner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "StockOwner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
