-- Same marking as 20261003120000_opening_stock, for opening balances issued to stores by the
-- previous version of the app between that migration and this deploy. Safe to run again.

UPDATE "StockLog" o
SET "openingStock" = true
FROM "Store" s
JOIN "Category" c ON c."id" = s."categoryId"
WHERE o."storeId" = s."id"
  AND c."isSystem" = true
  AND o."type" = 'TRANSFER_OUT'
  AND o."projectId" IS NULL
  AND o."recipientId" IS NULL
  AND o."openingStock" = false;

UPDATE "StockLog" i
SET "openingStock" = true
FROM "StockLog" o
WHERE o."openingStock" = true
  AND o."type" = 'TRANSFER_OUT'
  AND i."type" = 'TRANSFER_IN'
  AND i."openingStock" = false
  AND i."createdAt" = o."createdAt"
  AND i."productId" = o."productId"
  AND i."ownerId" = o."ownerId"
  AND i."quantity" = o."quantity"
  AND i."entryDate" = o."entryDate";
