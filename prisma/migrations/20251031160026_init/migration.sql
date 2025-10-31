/*
  Warnings:

  - You are about to drop the `UserIdentification` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UserIdentification" DROP CONSTRAINT "UserIdentification_userId_fkey";

-- DropTable
DROP TABLE "UserIdentification";
