// test/integration/ai-report.test.js
//
// The admin AI narrative: it is inert without a provider key, and - critically
// - it only ever sends AGGREGATE data to the model. The PII-firewall test
// injects a fake AI client, captures the exact prompt, and asserts no attendee
// name or email can appear in it.
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import { adminCookie, createAdmin, createAttendant } from "../helpers.js";
import {
  gatherAdminSnapshot,
  generateAdminAiSummary,
} from "../../src/services/analytics/ai-report.service.js";

const D1 = "2026-03-10";
const D2 = "2026-03-11";
const utc = (iso) => new Date(`${iso}T00:00:00.000Z`);
const noon = (iso) => new Date(`${iso}T12:00:00.000Z`);
const NOW = new Date("2026-07-20T09:00:00.000Z");
const range = { startDate: D1, endDate: D2 };

async function seed() {
  const admin = await createAdmin();
  // Distinctive, easy-to-grep identity so the firewall assertion is meaningful.
  const userA = await createAttendant({ email: "grace.hopper@secret.example" });
  const location = await prisma.location.create({ data: { name: "Hall" } });
  const event = await prisma.event.create({
    data: { title: "Standup", startDate: utc(D1), isRecurring: true, startTime: "09:00", endTime: "17:00", locationId: location.id, type: "MEETING" },
  });
  const session = await prisma.session.create({
    data: { eventId: event.id, startDate: utc(D1), endDate: utc(D1), startTime: noon(D1), endTime: noon(D1) },
  });
  await prisma.attendance.create({
    data: { userId: userA.id, sessionId: session.id, status: "PRESENT", checkInTime: noon(D1) },
  });
  return { admin, userA };
}

describe("POST /dashboard/admin/ai-summary", () => {
  it("reports not configured when no provider key is set (test env)", async () => {
    const { admin } = await seed();
    const res = await request(app)
      .post("/api/v1/dashboard/admin/ai-summary")
      .set("Cookie", [adminCookie(admin)])
      .send(range);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ configured: false });
  });
});

describe("AI narrative PII firewall", () => {
  it("only sends aggregate data - no attendee name or email reaches the model", async () => {
    await seed();

    let capturedPrompt = "";
    const fakeAi = {
      isConfigured: () => true,
      generateText: async (prompt) => {
        capturedPrompt = prompt;
        return "Attendance is healthy.\n- 100% turnout\n- Recommend keeping it up";
      },
    };

    const result = await generateAdminAiSummary(range, NOW, fakeAi);

    expect(result.configured).toBe(true);
    expect(result.summary).toContain("Attendance is healthy");
    expect(result.model).toBeTruthy();

    // The firewall: the seeded attendant's identity must NOT be in the prompt.
    expect(capturedPrompt).not.toContain("grace.hopper@secret.example");
    expect(capturedPrompt.toLowerCase()).not.toContain("hopper");

    // And the snapshot carries aggregates, not per-person rows.
    const snapshot = await gatherAdminSnapshot(range, NOW);
    const asJson = JSON.stringify(snapshot);
    expect(asJson).not.toMatch(/email|userName|leaderboard|topAttendees|profilePicture/i);
    expect(snapshot.kpis.attendanceRate.value).toBe(100);
    expect(snapshot.integrity.score).toBeGreaterThan(0);
  });
});
