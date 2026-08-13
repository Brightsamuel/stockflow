-- CreateTable
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StockLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "rate" REAL NOT NULL,
    "note" TEXT,
    "userId" TEXT,
    "recipientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockLog_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StockLog" ("createdAt", "id", "note", "productId", "quantity", "rate", "storeId", "type", "userId") SELECT "createdAt", "id", "note", "productId", "quantity", "rate", "storeId", "type", "userId" FROM "StockLog";
DROP TABLE "StockLog";
ALTER TABLE "new_StockLog" RENAME TO "StockLog";
CREATE TABLE "new_Transfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceStoreId" TEXT NOT NULL,
    "targetStoreId" TEXT,
    "recipientId" TEXT,
    "productId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transfer_sourceStoreId_fkey" FOREIGN KEY ("sourceStoreId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transfer_targetStoreId_fkey" FOREIGN KEY ("targetStoreId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transfer_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transfer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transfer" ("createdAt", "id", "productId", "quantity", "sourceStoreId", "targetStoreId", "userId") SELECT "createdAt", "id", "productId", "quantity", "sourceStoreId", "targetStoreId", "userId" FROM "Transfer";
DROP TABLE "Transfer";
ALTER TABLE "new_Transfer" RENAME TO "Transfer";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
