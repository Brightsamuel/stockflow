-- Sessions end when this changes (password change or reset, deactivation)
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Sign-in lockout after repeated failed attempts
ALTER TABLE "User" ADD COLUMN "failedLogins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
