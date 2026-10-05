-- An opening balance issued to a store is that store's opening stock: stock on hand from the
-- start, counted under Opening in its reports rather than as stock added that day.
ALTER TABLE "StockLog" ADD COLUMN "openingStock" BOOLEAN NOT NULL DEFAULT false;

-- Issues already made: the line leaving the hidden opening-balance store for another store...
UPDATE "StockLog" o
SET "openingStock" = true
FROM "Store" s
JOIN "Category" c ON c."id" = s."categoryId"
WHERE o."storeId" = s."id"
  AND c."isSystem" = true
  AND o."type" = 'TRANSFER_OUT'
  AND o."projectId" IS NULL
  AND o."recipientId" IS NULL;

-- ...and the line that received it, written in the same save
UPDATE "StockLog" i
SET "openingStock" = true
FROM "StockLog" o
WHERE o."openingStock" = true
  AND o."type" = 'TRANSFER_OUT'
  AND i."type" = 'TRANSFER_IN'
  AND i."createdAt" = o."createdAt"
  AND i."productId" = o."productId"
  AND i."ownerId" = o."ownerId"
  AND i."quantity" = o."quantity"
  AND i."entryDate" = o."entryDate";
