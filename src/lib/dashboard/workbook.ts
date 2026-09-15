import ExcelJS from "exceljs";

import { employeeStatusLabel } from "@/components/ui/StatusBadge";
import { SORT_LABELS, type DirectoryFilters } from "@/lib/dashboard/directory";
import { EMPLOYEE_STATUSES, type Employee, type EmployeeStatus } from "@/lib/types";

/**
 * The directory as a workbook someone outside this app can read.
 *
 * A CSV answers "give me the data". What HC is usually asked for is "give me
 * the list", and the person asking is a director or an auditor who will open it
 * once, read it, and never touch the filter bar it came from. So the file
 * carries its own context — what this is, when it was taken, who took it, and
 * which rows it does *not* include — because a spreadsheet with no provenance
 * is a spreadsheet nobody can act on.
 *
 * Server-side only. ExcelJS is around a megabyte; shipping it to the browser to
 * save one request would cost every page load in the app.
 */

/** Brand navy and gold, and the light palette's semantic inks. */
const NAVY = "FF173D6E";
const GOLD = "FFFDB713";
const INK = "FF0A1C33";
const INK_MUTED = "FF44607F";
const HAIRLINE = "FFD5E0EE";

/**
 * Print colours, not screen ones. These are the light theme's semantic values —
 * the dark theme's #34d399 sits at 1.9:1 on white and disappears on paper.
 */
const STATUS_STYLE: Record<EmployeeStatus, { font: string; fill: string }> = {
  ACTIVE: { font: "FF047857", fill: "FFE6F4EF" },
  PENDING_MANAGER_APPROVAL: { font: "FFB23C0A", fill: "FFFDEDE6" },
  PENDING_TRANSFER_APPROVAL: { font: "FFB23C0A", fill: "FFFDEDE6" },
  PENDING_SECURITY_SETUP: { font: "FF0369A1", fill: "FFE6F0F7" },
  PENDING_TRANSFER_SETUP: { font: "FF0369A1", fill: "FFE6F0F7" },
  PENDING_OFFBOARDING_APPROVAL: { font: "FFB23C0A", fill: "FFFDEDE6" },
  PENDING_OFFBOARDING_SETUP: { font: "FF0369A1", fill: "FFE6F0F7" },
  REJECTED: { font: "FFBE123C", fill: "FFFBE9EE" },
  DISABLED: { font: "FF44607F", fill: "FFEEF2F7" },
};

/** What each status means, for readers who have never seen this dashboard. */
const STATUS_MEANING: Record<EmployeeStatus, string> = {
  PENDING_MANAGER_APPROVAL: "Pengajuan akun baru, menunggu persetujuan manager. Akun belum dibuat.",
  PENDING_SECURITY_SETUP: "Sudah disetujui manager; IT Security sedang menyiapkan aksesnya.",
  ACTIVE: "Akun aktif dan akses berjalan normal.",
  DISABLED: "Akses ditangguhkan sementara oleh HC. Bisa diaktifkan kembali tanpa persetujuan.",
  REJECTED: "Pengajuan ditolak manager. Akun tidak dibuat.",
  PENDING_TRANSFER_APPROVAL:
    "Pengajuan pindah divisi, menunggu manager. Posisi lama masih berlaku.",
  PENDING_TRANSFER_SETUP:
    "Pindah divisi sudah disetujui; IT Security sedang menyesuaikan akses. Posisi baru belum berlaku.",
  PENDING_OFFBOARDING_APPROVAL:
    "Pengajuan penonaktifan akun, menunggu manager. Akses masih berjalan normal.",
  PENDING_OFFBOARDING_SETUP:
    "Penonaktifan sudah disetujui; IT Security sedang mencabut akses. Akun belum sepenuhnya nonaktif.",
};

const COLUMNS = [
  { header: "Nama", width: 26, get: (e: Employee) => e.displayName },
  { header: "Email", width: 32, get: (e: Employee) => e.email },
  { header: "Jabatan", width: 24, get: (e: Employee) => e.jobTitle },
  { header: "Departemen", width: 22, get: (e: Employee) => e.department },
  { header: "Manager", width: 22, get: (e: Employee) => e.managerName },
  { header: "Email manager", width: 32, get: (e: Employee) => e.managerEmail },
  { header: "Status", width: 26, get: (e: Employee) => employeeStatusLabel(e.status) },
] as const;

const STATUS_COLUMN = COLUMNS.length;

function formatStamp(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

/**
 * The filter, in words.
 *
 * The single most important line in the file: without it a reader cannot tell a
 * complete directory from a slice of one, and a partial list read as a complete
 * one is how someone concludes an account does not exist.
 */
export function describeFilters(filters: DirectoryFilters): string {
  const parts: string[] = [];
  if (filters.query.trim()) parts.push(`pencarian "${filters.query.trim()}"`);
  if (filters.department !== "ALL") parts.push(`departemen ${filters.department}`);
  if (filters.status === "PENDING") parts.push("status dalam persetujuan");
  else if (filters.status !== "ALL") parts.push(`status ${employeeStatusLabel(filters.status)}`);
  return parts.length === 0 ? "Tanpa saringan — seluruh direktori" : parts.join(", ");
}

export interface WorkbookContext {
  /** Rows as the screen had them: already filtered, already in sort order. */
  employees: Employee[];
  /** How many people the directory holds in total, filtered or not. */
  total: number;
  filters: DirectoryFilters;
  /** The officer who pressed Export. Named so the file is attributable. */
  exportedBy: string;
  brandName: string;
}

export async function buildDirectoryWorkbook(context: WorkbookContext): Promise<ArrayBuffer> {
  const { employees, total, filters, exportedBy, brandName } = context;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = `${brandName} · Human Capital`;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Direktori", {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  });

  COLUMNS.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });

  /* ---- Title block ---------------------------------------------------- */

  const lastLetter = String.fromCharCode(64 + COLUMNS.length);
  sheet.mergeCells(`A1:${lastLetter}1`);
  const title = sheet.getCell("A1");
  title.value = "DIREKTORI KARYAWAN";
  title.font = { name: "Calibri", size: 18, bold: true, color: { argb: NAVY } };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(`A2:${lastLetter}2`);
  const subtitle = sheet.getCell("A2");
  subtitle.value = `${brandName} · Human Capital`;
  subtitle.font = { name: "Calibri", size: 11, color: { argb: INK_MUTED } };

  // A gold rule under the lockup, the one place the accent appears.
  sheet.mergeCells(`A3:${lastLetter}3`);
  sheet.getRow(3).height = 4;
  sheet.getCell("A3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };

  const meta: Array<[string, string]> = [
    ["Diekspor", `${formatStamp(new Date())} WIB oleh ${exportedBy}`],
    ["Saringan", describeFilters(filters)],
    ["Urutan", `${SORT_LABELS[filters.sort]} (${filters.direction === "asc" ? "naik" : "turun"})`],
    ["Jumlah baris", `${employees.length} dari ${total} karyawan`],
  ];

  meta.forEach(([label, value], index) => {
    const row = 5 + index;
    const key = sheet.getCell(`A${row}`);
    key.value = label;
    key.font = { name: "Calibri", size: 10, bold: true, color: { argb: INK_MUTED } };
    sheet.mergeCells(`B${row}:${lastLetter}${row}`);
    const cell = sheet.getCell(`B${row}`);
    cell.value = value;
    cell.font = { name: "Calibri", size: 10, color: { argb: INK } };
  });

  /* ---- Table ----------------------------------------------------------- */

  const headerRowNumber = 5 + meta.length + 1;
  const headerRow = sheet.getRow(headerRowNumber);
  COLUMNS.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle" };
  });
  headerRow.height = 22;

  employees.forEach((employee, index) => {
    const row = sheet.getRow(headerRowNumber + 1 + index);
    COLUMNS.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      cell.value = column.get(employee);
      cell.font = { name: "Calibri", size: 10, color: { argb: INK } };
      cell.alignment = { vertical: "middle" };
      cell.border = { bottom: { style: "hair", color: { argb: HAIRLINE } } };
    });

    // The status carries its own colour, so the shape of the list is legible
    // before a single row is read.
    const style = STATUS_STYLE[employee.status];
    const statusCell = row.getCell(STATUS_COLUMN);
    statusCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: style.font } };
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
    row.height = 18;
  });

  const lastRow = headerRowNumber + employees.length;

  if (employees.length > 0) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: lastRow, column: COLUMNS.length },
    };
  }

  // The header stays put while the reader scrolls, and repeats on every printed
  // page — a second page of names with no column headings is unreadable.
  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }];
  sheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;

  if (employees.length === 0) {
    const empty = sheet.getRow(headerRowNumber + 1);
    sheet.mergeCells(`A${headerRowNumber + 1}:${lastLetter}${headerRowNumber + 1}`);
    empty.getCell(1).value = "Tidak ada karyawan yang cocok dengan saringan di atas.";
    empty.getCell(1).font = { name: "Calibri", size: 10, italic: true, color: { argb: INK_MUTED } };
  }

  /* ---- Glossary -------------------------------------------------------- */

  buildGlossary(workbook, brandName);

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/**
 * A second sheet explaining the statuses.
 *
 * "Penyiapan IT Security" means nothing to somebody who has never used this
 * dashboard, and the Status column is the one people draw conclusions from.
 */
function buildGlossary(workbook: ExcelJS.Workbook, brandName: string): void {
  const sheet = workbook.addWorksheet("Keterangan");
  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 86;

  sheet.mergeCells("A1:B1");
  const title = sheet.getCell("A1");
  title.value = "ARTI SETIAP STATUS";
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: NAVY } };
  sheet.getRow(1).height = 22;

  STATUS_HEADERS.forEach(([label, value], index) => {
    const row = sheet.getRow(3 + index);
    const key = row.getCell(1);
    key.value = label;
    key.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    key.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    const cell = row.getCell(2);
    cell.value = value;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  });

  EMPLOYEE_STATUSES.forEach((status, index) => {
    const row = sheet.getRow(4 + index);
    const style = STATUS_STYLE[status];
    const label = row.getCell(1);
    label.value = employeeStatusLabel(status);
    label.font = { name: "Calibri", size: 10, bold: true, color: { argb: style.font } };
    label.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
    label.alignment = { vertical: "middle" };
    const meaning = row.getCell(2);
    meaning.value = STATUS_MEANING[status];
    meaning.font = { name: "Calibri", size: 10, color: { argb: INK } };
    meaning.alignment = { vertical: "middle", wrapText: true };
    row.height = 26;
  });

  const note = sheet.getRow(6 + EMPLOYEE_STATUSES.length);
  sheet.mergeCells(`A${note.number}:B${note.number}`);
  note.getCell(1).value =
    `Setiap perubahan status pada daftar ini melewati persetujuan email, kecuali penangguhan akses ` +
    `sementara yang bisa dilakukan ${brandName} · Human Capital secara langsung.`;
  note.getCell(1).font = { name: "Calibri", size: 9, italic: true, color: { argb: INK_MUTED } };
  note.getCell(1).alignment = { wrapText: true, vertical: "top" };
  note.height = 28;
}

const STATUS_HEADERS: ReadonlyArray<[string, string]> = [["Status", "Artinya"]];
