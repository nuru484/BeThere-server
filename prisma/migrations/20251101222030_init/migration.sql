/*
  Warnings:

  - You are about to drop the column `attended` on the `Attendance` table. All the data in the column will be lost.
  - You are about to drop the column `recurrenceRule` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `endTime` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `Session` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[eventId,startDate]` on the table `Session` will be added. If there are existing duplicate values, this will fail.
  - Made the column `startDate` on table `Event` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `endDate` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endDateTime` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDateTime` to the `Session` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT');

-- DropIndex
DROP INDEX "Session_eventId_date_key";

-- AlterTable
ALTER TABLE "Attendance" DROP COLUMN "attended",
ADD COLUMN     "checkInTime" TIMESTAMP(3),
ADD COLUMN     "status" "AttendanceStatus" NOT NULL DEFAULT 'ABSENT';

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "recurrenceRule",
ADD COLUMN     "durationDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "recurrenceInterval" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "startDate" SET NOT NULL;

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "date",
DROP COLUMN "endTime",
DROP COLUMN "startTime",
ADD COLUMN     "endDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "endDateTime" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "startDateTime" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Session_eventId_startDate_key" ON "Session"("eventId", "startDate");
