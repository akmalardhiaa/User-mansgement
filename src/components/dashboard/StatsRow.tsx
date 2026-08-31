import { Card } from "@/components/ui/Field";
import type { Employee } from "@/lib/types";

/** Headline counts across the roster. */
export function StatsRow({ employees }: { employees: Employee[] }) {
  const count = (predicate: (employee: Employee) => boolean) => employees.filter(predicate).length;

  const stats = [
    { label: "Total karyawan", value: employees.length, tone: "text-ink" },
    { label: "Aktif", value: count((e) => e.status === "ACTIVE"), tone: "text-ok" },
    {
      label: "Dalam persetujuan",
      value: count(
        (e) => e.status === "PENDING_MANAGER_APPROVAL" || e.status === "PENDING_SECURITY_SETUP",
      ),
      tone: "text-warn",
    },
    { label: "Dinonaktifkan", value: count((e) => e.status === "DISABLED"), tone: "text-ink-muted" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="p-4">
          <p className="text-xs tracking-wide text-ink-faint uppercase">{stat.label}</p>
          <p className={`mt-2 text-2xl font-semibold tabular-nums ${stat.tone}`}>{stat.value}</p>
        </Card>
      ))}
    </div>
  );
}
