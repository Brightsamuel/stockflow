-- Signed change to the store balance made by an edit, a removal or a restore, so reports
-- can count them (opening + added - deducted + adjusted = closing)
ALTER TABLE "StockLog" ADD COLUMN "adjustment" DOUBLE PRECISION;

-- A removal takes the entry's stock out of the store; a restore puts it back
UPDATE "StockLog" SET "adjustment" = -"quantity" WHERE "type" = 'DELETE' AND "adjustment" IS NULL;
UPDATE "StockLog" SET "adjustment" = "quantity" WHERE "type" = 'RESTORE' AND "adjustment" IS NULL;

-- Quantity edits were logged with the new quantity and a note such as "quantity 100 → 80"
UPDATE "StockLog"
SET "adjustment" = "quantity" - CAST(substring("note" from 'quantity (-?[0-9]+(?:\.[0-9]+)?(?:e[-+]?[0-9]+)?) →') AS DOUBLE PRECISION)
WHERE "type" = 'EDIT' AND "adjustment" IS NULL AND "note" ~ 'quantity -?[0-9]+(\.[0-9]+)?(e[-+]?[0-9]+)? →';

-- Edits that didn't change the quantity (rate or alert only) adjust nothing
UPDATE "StockLog" SET "adjustment" = NULL WHERE "type" = 'EDIT' AND "adjustment" = 0;
