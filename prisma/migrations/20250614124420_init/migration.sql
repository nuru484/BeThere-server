/*
  Warnings:

  - You are about to drop the column `attendanceEndTime` on the `Attendance` table. All the data in the column will be lost.
  - You are about to drop the column `attendanceStartTime` on the `Attendance` table. All the data in the column will be lost.
  - Made the column `endTime` on table `Session` required. This step will fail if there are existing NULL values in that column.
  - Made the column `startTime` on table `Session` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Attendance" DROP COLUMN "attendanceEndTime",
DROP COLUMN "attendanceStartTime";

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "endTime" SET NOT NULL,
ALTER COLUMN "endTime" SET DATA TYPE TEXT,
ALTER COLUMN "startTime" SET NOT NULL,
ALTER COLUMN "startTime" SET DATA TYPE TEXT;
