-- Enrollment challenges prove liveness before any template exists, so they
-- belong to no event. Widening the column is backward compatible: existing
-- rows and the previous release keep working unchanged.
ALTER TABLE "LivenessChallenge" ALTER COLUMN "eventId" DROP NOT NULL;
