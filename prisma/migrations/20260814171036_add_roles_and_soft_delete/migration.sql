/*
  Warnings:

  - You are about to drop the column `isAdmin` on the `User` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StockEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "quantity" REAL NOT NULL,
    "lowStockAt" REAL NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StockEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StockEntry" ("createdAt", "id", "lowStockAt", "productId", "quantity", "rate", "storeId", "updatedAt") SELECT "createdAt", "id", "lowStockAt", "productId", "quantity", "rate", "storeId", "updatedAt" FROM "StockEntry";
DROP TABLE "StockEntry";
ALTER TABLE "new_StockEntry" RENAME TO "StockEntry";
CREATE UNIQUE INDEX "StockEntry_productId_storeId_key" ON "StockEntry"("productId", "storeId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STANDARD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "id", "isActive", "passwordHash", "username") SELECT "createdAt", "id", "isActive", "passwordHash", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
