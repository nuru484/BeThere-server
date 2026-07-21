-- CreateEnum
CREATE TYPE "PairingScope" AS ENUM ('ATTENDANCE', 'ENROLL');

-- CreateEnum
CREATE TYPE "PairingStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "PairingSession" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "scope" "PairingScope" NOT NULL,
    "eventId" INTEGER,
    "mode" TEXT NOT NULL DEFAULT 'in',
    "status" "PairingStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PairingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PairingSession_userId_idx" ON "PairingSession"("userId");

-- CreateIndex
CREATE INDEX "PairingSession_expiresAt_idx" ON "PairingSession"("expiresAt");
