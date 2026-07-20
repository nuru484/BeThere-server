// test/setup.js
//
// Per-file test setup: wipes every table between tests so cases never see
// each other's rows, and disconnects Prisma when the file ends.
import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/config/prisma-client.js";
import { clearAuthzCache } from "../src/utils/authz-cache.js";

beforeEach(async () => {
  clearAuthzCache();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AttendanceEvidence", "AnomalyFlag", "LivenessChallenge", "AuditLog", "Attendance", "Session", "Event", "Location", "PasswordReset", "RefreshToken", "OtpCode", "Admin", "User" RESTART IDENTITY CASCADE'
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
