-- Who may approve stock outs; granted per user by an admin. Nobody has it until then.
ALTER TABLE "User" ADD COLUMN "canApprove" BOOLEAN NOT NULL DEFAULT false;
