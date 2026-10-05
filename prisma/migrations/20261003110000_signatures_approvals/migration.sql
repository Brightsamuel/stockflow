-- Names typed when stock is recorded, for the signature blocks on its note, and approvers'
-- sign-off of stock outs. Existing rows are unchanged (all new columns start empty).

-- AlterTable
ALTER TABLE "StockLog" ADD COLUMN     "handedOverBy" TEXT,
ADD COLUMN     "receivedBy" TEXT,
ADD COLUMN     "approvalId" TEXT;

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comment" TEXT,
    "kind" TEXT NOT NULL,
    "refNo" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockLog_approvalId_idx" ON "StockLog"("approvalId");

-- AddForeignKey
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
