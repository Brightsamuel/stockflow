-- Catch-up for 20260930100000_stock_adjustments: fills the adjustment on any edit, removal or
-- restore logged by the previous version of the app between that migration and this deploy.
-- Only rows still missing a value are touched, so running it is always safe.
UPDATE "StockLog" SET "adjustment" = -"quantity" WHERE "type" = 'DELETE' AND "adjustment" IS NULL;
UPDATE "StockLog" SET "adjustment" = "quantity" WHERE "type" = 'RESTORE' AND "adjustment" IS NULL;

UPDATE "StockLog"
SET "adjustment" = "quantity" - CAST(substring("note" from 'quantity (-?[0-9]+(?:\.[0-9]+)?(?:e[-+]?[0-9]+)?) →') AS DOUBLE PRECISION)
WHERE "type" = 'EDIT' AND "adjustment" IS NULL AND "note" ~ 'quantity -?[0-9]+(\.[0-9]+)?(e[-+]?[0-9]+)? →';

UPDATE "StockLog" SET "adjustment" = NULL WHERE "type" = 'EDIT' AND "adjustment" = 0;
