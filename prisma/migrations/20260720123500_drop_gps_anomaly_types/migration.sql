-- Removes the two anomaly types that became unreachable when GPS coordinates
-- were dropped (migration 20260719230000_remove_gps_coordinates): no code can
-- flag IMPOSSIBLE_TRAVEL or GEO_IP_MISMATCH, and no rows hold them (the
-- values were never written). Safe cast: every remaining row's value exists
-- in the new type.
BEGIN;
CREATE TYPE "AnomalyType_new" AS ENUM ('DUPLICATE_DESCRIPTOR', 'LIVENESS_FAILED', 'REPLAY_SUSPECTED', 'RAPID_ATTEMPTS');
ALTER TABLE "AnomalyFlag" ALTER COLUMN "type" TYPE "AnomalyType_new" USING ("type"::text::"AnomalyType_new");
ALTER TYPE "AnomalyType" RENAME TO "AnomalyType_old";
ALTER TYPE "AnomalyType_new" RENAME TO "AnomalyType";
DROP TYPE "public"."AnomalyType_old";
COMMIT;
