-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "directKey" TEXT,
ALTER COLUMN "lastMessageAt" DROP NOT NULL,
ALTER COLUMN "lastMessageAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "clientMessageId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_directKey_key" ON "Conversation"("directKey");

-- CreateIndex
CREATE UNIQUE INDEX "Message_userId_clientMessageId_key" ON "Message"("userId", "clientMessageId");
