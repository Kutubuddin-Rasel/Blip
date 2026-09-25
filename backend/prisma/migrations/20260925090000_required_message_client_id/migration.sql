-- Every application message creation path supplies a client-generated UUID.
ALTER TABLE "Message" ALTER COLUMN "clientMessageId" SET NOT NULL;
