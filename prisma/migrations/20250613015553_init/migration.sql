/*
  Warnings:

  - The values [STUDENT] on the enum `role` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `eventId` on the `Attendance` table. All the data in the column will be lost.
  - You are about to drop the column `markedBy` on the `Attendance` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Event` table. All the data in the column will be lost.
  - The primary key for the `Session` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `data` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `sid` on the `Session` table. All the data in the column will be lost.
  - The `id` column on the `Session` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `refreshToken` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `identification` on the `UserIdentification` table. All the data in the column will be lost.
  - You are about to drop the column `taken` on the `UserIdentification` table. All the data in the column will be lost.
  - You are about to drop the `Registration` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId,sessionId]` on the table `Attendance` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[eventId,date]` on the table `Session` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[phoneNumber]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[identityNumber]` on the table `UserIdentification` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId]` on the table `UserIdentification` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `sessionId` to the `Attendance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endTime` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `locationId` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTime` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `date` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `eventId` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `identityNumber` to the `UserIdentification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "role_new" AS ENUM ('ADMIN', 'USER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "role_new" USING ("role"::text::"role_new");
ALTER TYPE "role" RENAME TO "role_old";
ALTER TYPE "role_new" RENAME TO "role";
DROP TYPE "role_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_userId_fkey";

-- DropIndex
DROP INDEX "Attendance_userId_eventId_key";

-- DropIndex
DROP INDEX "Session_sid_key";

-- DropIndex
DROP INDEX "User_refreshToken_key";

-- DropIndex
DROP INDEX "User_username_key";

-- DropIndex
DROP INDEX "UserIdentification_identification_key";

-- AlterTable
ALTER TABLE "Attendance" DROP COLUMN "eventId",
DROP COLUMN "markedBy",
ADD COLUMN     "sessionId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "category",
DROP COLUMN "date",
DROP COLUMN "location",
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "endTime" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locationId" INTEGER NOT NULL,
ADD COLUMN     "recurrenceRule" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "startTime" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Session" DROP CONSTRAINT "Session_pkey",
DROP COLUMN "data",
DROP COLUMN "expiresAt",
DROP COLUMN "sid",
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "endTime" TIMESTAMP(3),
ADD COLUMN     "eventId" INTEGER NOT NULL,
ADD COLUMN     "startTime" TIMESTAMP(3),
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Session_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "User" DROP COLUMN "refreshToken",
DROP COLUMN "username",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "faceScan" TEXT,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "profilePicture" VARCHAR(255),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'USER';

-- AlterTable
ALTER TABLE "UserIdentification" DROP COLUMN "identification",
DROP COLUMN "taken",
ADD COLUMN     "identityNumber" TEXT NOT NULL,
ADD COLUMN     "userId" INTEGER;

-- DropTable
DROP TABLE "Registration";

-- CreateTable
CREATE TABLE "Location" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_city_idx" ON "Location"("city");

-- CreateIndex
CREATE INDEX "Location_country_idx" ON "Location"("country");

-- CreateIndex
CREATE INDEX "Location_name_idx" ON "Location"("name");

-- CreateIndex
CREATE INDEX "Location_latitude_longitude_idx" ON "Location"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_latitude_longitude_key" ON "Location"("name", "latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_userId_sessionId_key" ON "Attendance"("userId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_eventId_date_key" ON "Session"("eventId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentification_identityNumber_key" ON "UserIdentification"("identityNumber");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentification_userId_key" ON "UserIdentification"("userId");

-- AddForeignKey
ALTER TABLE "UserIdentification" ADD CONSTRAINT "UserIdentification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
