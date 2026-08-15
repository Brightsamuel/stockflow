-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "companyName" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logoUrl" TEXT
);
