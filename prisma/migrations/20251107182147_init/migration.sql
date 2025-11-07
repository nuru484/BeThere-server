/*
  Warnings:

  - You are about to drop the column `endDateTime` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `startDateTime` on the `Session` table. All the data in the column will be lost.
  - Made the column `checkInTime` on table `Attendance` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `endTime` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTime` to the `Session` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "checkOutTime" TIMESTAMP(3),
ALTER COLUMN "checkInTime" SET NOT NULL;

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "endDateTime",
DROP COLUMN "startDateTime",
ADD COLUMN     "endTime" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "startTime" TIMESTAMP(3) NOT NULL;
