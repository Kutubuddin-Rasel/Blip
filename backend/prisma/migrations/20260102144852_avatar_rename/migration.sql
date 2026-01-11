/*
  Warnings:

  - You are about to drop the column `avatart` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "avatart",
ADD COLUMN     "avatar" TEXT;
