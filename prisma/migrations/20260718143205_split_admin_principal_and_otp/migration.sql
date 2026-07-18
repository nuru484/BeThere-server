-- Split the Admin principal out of User (which becomes the attendants
-- table), add OtpCode for OTP login / 2FA, and move RefreshToken and
-- PasswordReset onto (kind, principalId) so both principal tables share
-- them. Data-preserving: admin rows are copied into Admin, their security
-- rows re-tagged, and their attendance (staff never check in) removed with
-- the User rows.

-- 1) New Admin table
CREATE TABLE "Admin" (
    "id" SERIAL NOT NULL,
    "firstName" VARCHAR(255) NOT NULL,
    "lastName" VARCHAR(255) NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "profilePicture" VARCHAR(255),
    "phone" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");
CREATE UNIQUE INDEX "Admin_phone_key" ON "Admin"("phone");
CREATE INDEX "Admin_deletedAt_idx" ON "Admin"("deletedAt");

-- 2) Copy admins over (keep their own id sequence; ids may overlap with
--    attendants, which is why kind travels with every principal id)
INSERT INTO "Admin" ("firstName", "lastName", "password", "email", "profilePicture", "phone", "tokenVersion", "deletedAt", "createdAt", "updatedAt")
SELECT "firstName", "lastName", "password", "email", "profilePicture", "phone", "tokenVersion", "deletedAt", "createdAt", "updatedAt"
FROM "User" WHERE "role" = 'ADMIN';

-- 3) OtpCode table
CREATE TABLE "OtpCode" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "principalId" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OtpCode_kind_principalId_purpose_idx" ON "OtpCode"("kind", "principalId", "purpose");
CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");

-- 4) RefreshToken -> (kind, principalId); admin rows re-point at Admin ids
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_userId_fkey";
ALTER TABLE "RefreshToken" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE "RefreshToken" RENAME COLUMN "userId" TO "principalId";
UPDATE "RefreshToken" rt SET "kind" = 'ADMIN',
  "principalId" = a."id"
FROM "User" u JOIN "Admin" a ON a."email" = u."email"
WHERE rt."principalId" = u."id" AND u."role" = 'ADMIN';
ALTER TABLE "RefreshToken" ALTER COLUMN "kind" DROP DEFAULT;
DROP INDEX IF EXISTS "RefreshToken_userId_idx";
CREATE INDEX "RefreshToken_kind_principalId_idx" ON "RefreshToken"("kind", "principalId");

-- 5) PasswordReset -> (kind, principalId); same re-pointing
ALTER TABLE "PasswordReset" DROP CONSTRAINT "PasswordReset_userId_fkey";
ALTER TABLE "PasswordReset" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE "PasswordReset" RENAME COLUMN "userId" TO "principalId";
UPDATE "PasswordReset" pr SET "kind" = 'ADMIN',
  "principalId" = a."id"
FROM "User" u JOIN "Admin" a ON a."email" = u."email"
WHERE pr."principalId" = u."id" AND u."role" = 'ADMIN';
ALTER TABLE "PasswordReset" ALTER COLUMN "kind" DROP DEFAULT;
DROP INDEX IF EXISTS "PasswordReset_userId_idx";
CREATE INDEX "PasswordReset_kind_principalId_idx" ON "PasswordReset"("kind", "principalId");

-- 6) Remove admin rows (and any attendance they carried) from User
DELETE FROM "Attendance" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'ADMIN');
DELETE FROM "User" WHERE "role" = 'ADMIN';

-- 7) User (attendants) columns: 2FA + phone verification; role is gone
ALTER TABLE "User" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "phoneVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" DROP COLUMN "role";
DROP INDEX IF EXISTS "User_role_idx";
DROP TYPE IF EXISTS "role";
