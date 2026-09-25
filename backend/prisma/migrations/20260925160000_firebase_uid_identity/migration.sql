ALTER TABLE "User" ADD COLUMN "firebaseUid" TEXT NOT NULL;

CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");
