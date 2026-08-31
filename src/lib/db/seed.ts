import type { Employee } from "@/lib/types";

/**
 * Demo roster written on first boot so the dashboard is never empty.
 * Delete `data/hc-store.json` to reseed.
 */
export function seedEmployees(): Employee[] {
  const now = new Date("2026-01-06T09:00:00.000Z").toISOString();

  const rows: Array<Omit<Employee, "id" | "createdAt" | "updatedAt">> = [
    {
      name: "Ayu Prameswari",
      email: "ayu.prameswari@example.com",
      jobTitle: "Head of Human Capital",
      department: "Human Capital",
      managerName: "Dimas Anggara",
      managerEmail: "dimas.anggara@example.com",
      status: "ACTIVE",
    },
    {
      name: "Rizky Maulana",
      email: "rizky.maulana@example.com",
      jobTitle: "Senior Backend Engineer",
      department: "Engineering",
      managerName: "Sarah Wijaya",
      managerEmail: "sarah.wijaya@example.com",
      status: "ACTIVE",
    },
    {
      name: "Sarah Wijaya",
      email: "sarah.wijaya@example.com",
      jobTitle: "Engineering Manager",
      department: "Engineering",
      managerName: "Dimas Anggara",
      managerEmail: "dimas.anggara@example.com",
      status: "ACTIVE",
    },
    {
      name: "Bagus Nugroho",
      email: "bagus.nugroho@example.com",
      jobTitle: "IT Security Analyst",
      department: "IT Security",
      managerName: "Dimas Anggara",
      managerEmail: "dimas.anggara@example.com",
      status: "ACTIVE",
    },
    {
      name: "Clara Halim",
      email: "clara.halim@example.com",
      jobTitle: "Financial Analyst",
      department: "Finance",
      managerName: "Dimas Anggara",
      managerEmail: "dimas.anggara@example.com",
      status: "DISABLED",
    },
    {
      name: "Yoga Pratama",
      email: "yoga.pratama@example.com",
      jobTitle: "Product Designer",
      department: "Product",
      managerName: "Sarah Wijaya",
      managerEmail: "sarah.wijaya@example.com",
      status: "ACTIVE",
    },
  ];

  return rows.map((row, index) => ({
    ...row,
    id: `emp_seed_${String(index + 1).padStart(3, "0")}`,
    createdAt: now,
    updatedAt: now,
  }));
}
