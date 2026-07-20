-- CreateEnum
CREATE TYPE "AnomalyType" AS ENUM ('IMPOSSIBLE_TRAVEL', 'GEO_IP_MISMATCH', 'DUPLICATE_DESCRIPTOR', 'LIVENESS_FAILED', 'REPLAY_SUSPECTED', 'RAPID_ATTEMPTS');

-- CreateEnum
CREATE TYPE "AnomalySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "checkInLat" DOUBLE PRECISION,
ADD COLUMN     "checkInLng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "biometricConsentAt" TIMESTAMP(3),
ADD COLUMN     "biometricConsentVersion" TEXT,
ADD COLUMN     "faceLastUsedAt" TIMESTAMP(3),
ADD COLUMN     "faceScanEnc" TEXT;

-- CreateTable
CREATE TABLE "LivenessChallenge" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventId" INTEGER NOT NULL,
    "nonce" TEXT NOT NULL,
    "actions" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivenessChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnomalyFlag" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventId" INTEGER,
    "type" "AnomalyType" NOT NULL,
    "severity" "AnomalySeverity" NOT NULL DEFAULT 'MEDIUM',
    "detail" JSONB,
    "evidenceId" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnomalyFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEvidence" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventId" INTEGER NOT NULL,
    "attendanceId" INTEGER,
    "frameUrls" JSONB NOT NULL,
    "livenessScore" DOUBLE PRECISION,
    "matchDistance" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" INTEGER,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" INTEGER,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LivenessChallenge_nonce_key" ON "LivenessChallenge"("nonce");

-- CreateIndex
CREATE INDEX "LivenessChallenge_userId_eventId_idx" ON "LivenessChallenge"("userId", "eventId");

-- CreateIndex
CREATE INDEX "LivenessChallenge_expiresAt_idx" ON "LivenessChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "AnomalyFlag_userId_idx" ON "AnomalyFlag"("userId");

-- CreateIndex
CREATE INDEX "AnomalyFlag_type_idx" ON "AnomalyFlag"("type");

-- CreateIndex
CREATE INDEX "AnomalyFlag_createdAt_idx" ON "AnomalyFlag"("createdAt");

-- CreateIndex
CREATE INDEX "AnomalyFlag_resolvedAt_idx" ON "AnomalyFlag"("resolvedAt");

-- CreateIndex
CREATE INDEX "AttendanceEvidence_userId_idx" ON "AttendanceEvidence"("userId");

-- CreateIndex
CREATE INDEX "AttendanceEvidence_expiresAt_idx" ON "AttendanceEvidence"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorKind_actorId_idx" ON "AuditLog"("actorKind", "actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
