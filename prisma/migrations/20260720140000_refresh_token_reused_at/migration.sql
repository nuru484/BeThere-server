-- Bounds the refresh rotation-race leeway to a single re-issue per token.
-- Additive and nullable, so the previous release keeps working unchanged.
ALTER TABLE "RefreshToken" ADD COLUMN "reusedAt" TIMESTAMP(3);
