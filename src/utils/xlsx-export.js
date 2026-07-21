// src/utils/xlsx-export.js
//
// A tiny wrapper over exceljs: turn a declarative sheet plan into an .xlsx
// buffer. Reports are bounded, so a single in-memory workbook is enough (no
// streaming). Each sheet is { name, columns: [{header,key,width}], rows: [] }.
import ExcelJS from "exceljs";

/**
 * @param {Array<{name: string, columns: Array<{header: string, key: string, width?: number}>, rows: Array<object>}>} sheets
 * @returns {Promise<Buffer>}
 */
export async function buildWorkbookBuffer(sheets) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BeThere";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    worksheet.columns = sheet.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? 18,
    }));
    // Bold, frozen header row.
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    for (const row of sheet.rows) worksheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
