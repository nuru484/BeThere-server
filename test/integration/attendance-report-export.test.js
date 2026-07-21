// test/integration/attendance-report-export.test.js
//
// The .xlsx export of the attendance report: correct headers, a parseable
// workbook with the expected sheets, row counts that honour the filters, and
// the admin-only gate.
import { describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import { adminCookie, attendantCookie, createAdmin, createAttendant } from "../helpers.js";

const D1 = "2026-03-10";
const utc = (iso) => new Date(`${iso}T00:00:00.000Z`);
const noon = (iso) => new Date(`${iso}T12:00:00.000Z`);

async function seed() {
  const admin = await createAdmin();
  const userA = await createAttendant({ email: "a@test.local" });
  const userB = await createAttendant({ email: "b@test.local" });
  const location = await prisma.location.create({ data: { name: "Main Hall", city: "Accra", country: "Ghana" } });
  const event = await prisma.event.create({
    data: { title: "Standup", startDate: utc(D1), isRecurring: true, startTime: "09:00", endTime: "17:00", locationId: location.id, type: "MEETING" },
  });
  const session = await prisma.session.create({
    data: { eventId: event.id, startDate: utc(D1), endDate: utc(D1), startTime: noon(D1), endTime: noon(D1) },
  });
  await prisma.attendance.createMany({
    data: [
      { userId: userA.id, sessionId: session.id, status: "PRESENT", checkInTime: noon(D1) },
      { userId: userB.id, sessionId: session.id, status: "LATE", checkInTime: new Date(`${D1}T12:05:00.000Z`) },
    ],
  });
  return { admin, userA };
}

const binaryParser = (res, cb) => {
  res.setEncoding("binary");
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => cb(null, Buffer.from(data, "binary")));
};

async function loadWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

describe("GET /attendance-reports/export", () => {
  it("returns a parseable xlsx with Summary, Records, and Top attendees", async () => {
    const { admin } = await seed();

    const res = await request(app)
      .get("/api/v1/attendance-reports/export")
      .set("Cookie", [adminCookie(admin)])
      .buffer()
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="attendance-report-.*\.xlsx"/);

    const wb = await loadWorkbook(res.body);
    expect(wb.getWorksheet("Summary")).toBeTruthy();
    expect(wb.getWorksheet("Top attendees")).toBeTruthy();

    const records = wb.getWorksheet("Records");
    expect(records).toBeTruthy();
    // header row + 2 attendance rows
    expect(records.actualRowCount).toBe(3);
    // header labels
    expect(records.getRow(1).getCell(1).value).toBe("Attendee");
    expect(records.getRow(1).getCell(12).value).toBe("Status");
  });

  it("honours filters (status=PRESENT -> one data row)", async () => {
    const { admin } = await seed();
    const res = await request(app)
      .get("/api/v1/attendance-reports/export?status=PRESENT")
      .set("Cookie", [adminCookie(admin)])
      .buffer()
      .parse(binaryParser);

    expect(res.status).toBe(200);
    const wb = await loadWorkbook(res.body);
    expect(wb.getWorksheet("Records").actualRowCount).toBe(2); // header + 1
  });

  it("neutralizes formula-injection in user-controlled cells", async () => {
    const admin = await createAdmin();
    // An attendant whose name would be a formula if written raw into a cell.
    const evil = await prisma.user.create({
      data: { firstName: "=HYPERLINK(\"http://evil\")", lastName: "X", email: "evil@test.local", password: "x" },
    });
    const location = await prisma.location.create({ data: { name: "Hall" } });
    const event = await prisma.event.create({
      data: { title: "Standup", startDate: utc(D1), isRecurring: false, startTime: "09:00", endTime: "17:00", locationId: location.id, type: "MEETING" },
    });
    const session = await prisma.session.create({
      data: { eventId: event.id, startDate: utc(D1), endDate: utc(D1), startTime: noon(D1), endTime: noon(D1) },
    });
    await prisma.attendance.create({ data: { userId: evil.id, sessionId: session.id, status: "PRESENT", checkInTime: noon(D1) } });

    const res = await request(app)
      .get("/api/v1/attendance-reports/export")
      .set("Cookie", [adminCookie(admin)])
      .buffer()
      .parse(binaryParser);

    const wb = await loadWorkbook(res.body);
    const attendeeCell = wb.getWorksheet("Records").getRow(2).getCell(1).value;
    // Prefixed with a quote so the spreadsheet treats it as text, not a formula.
    expect(attendeeCell.startsWith("'=")).toBe(true);
  });

  it("is not exportable by an attendant", async () => {
    const { userA } = await seed();
    const res = await request(app)
      .get("/api/v1/attendance-reports/export")
      .set("Cookie", [attendantCookie(userA)]);
    expect(res.status).toBe(403);
  });
});
