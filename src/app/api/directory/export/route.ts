

import { getActorName, getCurrentUser } from "@/lib/auth/current";
import { getBrand } from "@/lib/config/brand";
import { filterEmployees, sanitiseFilters, sortEmployees } from "@/lib/dashboard/directory";
import { listEmployees, recordActivity } from "@/lib/db/repository";
import { buildDirectoryWorkbook, describeFilters } from "@/lib/dashboard/workbook";
import { fail } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/**
 * POST /api/directory/export — the visible rows as a formatted workbook.
 *
 * Takes the filter state rather than the rows themselves, and re-runs the same
 * `filterEmployees`/`sortEmployees` the screen used against the store. The
 * export therefore matches what HC was looking at without the client being able
 * to dictate its contents, and a roster that changed since the page loaded is
 * exported as it stands now rather than as a stale copy.
 */
export async function POST(request: Request) {
  const session = await getCurrentUser();
  // The proxy already refused anonymous callers; this is for the name on
  // the file, and a belt-and-braces check because that name is the only thing
  // making the export attributable.
  if (!session) return fail("Sesi tidak ditemukan.", 401);

  // Sanitised, not spread: this is a request body, and an unrecognised status
  // spread straight into the defaults reached a lookup that assumed a real one.
  const body = (await request.json().catch(() => ({}))) as { filters?: unknown };
  const filters = sanitiseFilters(body.filters);

  const employees = await listEmployees();
  const visible = sortEmployees(
    filterEmployees(employees, filters),
    filters.sort,
    filters.direction,
  );

  const buffer = await buildDirectoryWorkbook({
    employees: visible,
    total: employees.length,
    filters,
    exportedBy: session.name,
    brandName: getBrand().name,
  });

  await recordActivity({
    // The same credit the workflow trail uses, so one name identifies one
    // person across both. The file itself keeps the plainer form.
    actor: await getActorName(),
    action: "directory.exported",
    detail: `Mengekspor ${visible.length} dari ${employees.length} baris direktori — ${describeFilters(filters)}.`,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="direktori-karyawan-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
