-- GPS/geofencing removed: presence is now proven by the scanned rotating
-- venue code, so all latitude/longitude columns are dead weight.

-- AlterTable
ALTER TABLE "Location" DROP COLUMN "latitude",
DROP COLUMN "longitude";

-- AlterTable
ALTER TABLE "Attendance" DROP COLUMN "checkInLat",
DROP COLUMN "checkInLng";

-- AlterTable
ALTER TABLE "AttendanceEvidence" DROP COLUMN "latitude",
DROP COLUMN "longitude";
