-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "autoCheckedOut" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "checkInTime" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "finalizedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Session_finalizedAt_idx" ON "Session"("finalizedAt");
