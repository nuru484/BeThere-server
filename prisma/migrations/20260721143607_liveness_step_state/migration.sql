-- AlterTable
ALTER TABLE "LivenessChallenge" ADD COLUMN     "currentStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stateEnc" TEXT;
