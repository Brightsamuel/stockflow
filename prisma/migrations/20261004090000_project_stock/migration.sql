-- Stock received for a project is kept for it on its own row in the store; NULL = general stock.
-- Existing rows are all general stock, so nothing about current balances changes.

-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "forProjectId" TEXT;

-- AlterTable
ALTER TABLE "StockLog" ADD COLUMN     "forProjectId" TEXT;

-- One row per product, store, owner and project. NULLS NOT DISTINCT (PostgreSQL 15+) keeps it at
-- one general row, exactly as the old (productId, storeId, ownerId) key did, so the new index is
-- created before the old one is dropped.
CREATE UNIQUE INDEX "StockEntry_productId_storeId_ownerId_forProjectId_key"
  ON "StockEntry"("productId", "storeId", "ownerId", "forProjectId") NULLS NOT DISTINCT;

-- DropIndex
DROP INDEX "StockEntry_productId_storeId_ownerId_key";

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_forProjectId_fkey" FOREIGN KEY ("forProjectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_forProjectId_fkey" FOREIGN KEY ("forProjectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
