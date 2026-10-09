-- A Deletion either deletes (a note, or an item deleted for good) or holds the lines a Goods
-- Received Note had before it was edited. Existing rows are deletions.
ALTER TABLE "Deletion" ADD COLUMN "action" TEXT NOT NULL DEFAULT 'DELETE';
