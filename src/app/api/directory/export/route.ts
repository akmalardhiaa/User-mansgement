import { actorNameOf } from "@/lib/auth/current";
import { requirePermission } from "@/lib/auth/guard";
import { getBrand } from "@/lib/config/brand";
import { filterEmployees, sanitiseFilters, sortEmployees } from "@/lib/dashboard/directory";
import { listEmployees, recordActivity } from "@/lib/db/repository";
import { buildDirectoryWorkbook, describeFilters } from "@/lib/dashboard/workbook";
import { loadPendingEmployeeIds } from "@/lib/lifecycle/pendingStore";

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
  const guarded = await requirePermission("directory.export");
  if (!guarded.ok) return guarded.response;

  // Sanitised, not spread: this is a request body, and an unrecognised status
  // spread straight into the defaults reached a lookup that assumed a real one.
  const body = (await request.json().catch(() => ({}))) as { filters?: unknown };
  const filters = sanitiseFilters(body.filters);

  // The same two reads the screen made, so an export taken from a filtered view
  // contains the same rows the person was looking at.
  const [employees, pendingIds] = await Promise.all([listEmployees(), loadPendingEmployeeIds()]);
  const visible = sortEmployees(
    filterEmployees(employees, filters, pendingIds),
    filters.sort,
    filters.direction,
  );

  const buffer = await buildDirectoryWorkbook({
    employees: visible,
    total: employees.length,
    filters,
    exportedBy: guarded.session.fullName,
    brandName: getBrand().name,
  });

  await recordActivity({
    // The same credit the workflow trail uses, so one name identifies one
    // person across both. The file itself keeps the plainer form.
    actor: actorNameOf(guarded.session),
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
