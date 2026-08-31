import type { Employee } from "@/lib/types";

/**
 * Demo roster written on first boot so the dashboard is never empty.
 * Delete `data/hc-store.json` to reseed.
 */
export function seedEmployees(): Employee[] {
  const now = new Date("2026-01-06T09:00:00.000Z").toISOString();

  const rows: Array<
    [
      firstName: string,
      lastName: string,
      email: string,
      jobTitle: string,
      department: string,
      managerName: string,
      managerEmail: string,
      status: Employee["status"],
    ]
  > = [
    ["Ayu", "Prameswari", "ayu.prameswari@example.com", "Head of Human Capital", "Human Capital", "Dimas Anggara", "dimas.anggara@example.com", "ACTIVE"],
    ["Rizky", "Maulana", "rizky.maulana@example.com", "Senior Backend Engineer", "IT — Engineering", "Sarah Wijaya", "sarah.wijaya@example.com", "ACTIVE"],
    ["Sarah", "Wijaya", "sarah.wijaya@example.com", "Engineering Manager", "IT — Engineering", "Dimas Anggara", "dimas.anggara@example.com", "ACTIVE"],
    ["Bagus", "Nugroho", "bagus.nugroho@example.com", "Security Analyst", "IT — Security", "Dimas Anggara", "dimas.anggara@example.com", "ACTIVE"],
    ["Clara", "Halim", "clara.halim@example.com", "Financial Analyst", "Finance", "Dimas Anggara", "dimas.anggara@example.com", "DISABLED"],
    ["Yoga", "Pratama", "yoga.pratama@example.com", "Product Designer", "IT — Product", "Sarah Wijaya", "sarah.wijaya@example.com", "ACTIVE"],
  ];

  return rows.map(
    ([firstName, lastName, email, jobTitle, department, managerName, managerEmail, status], index) => {
      const fullName = `${firstName} ${lastName}`;
      return {
        id: `emp_seed_${String(index + 1).padStart(3, "0")}`,
        firstName,
        lastName,
        displayName: fullName,
        fullName,
        email,
        jobTitle,
        department,
        managerName,
        managerEmail,
        status,
        createdAt: now,
        updatedAt: now,
      };
    },
  );
}

/** Divisions HC can pick from. IT is split into several, which is why transfers exist. */
export const DEPARTMENTS = [
  "IT — Engineering",
  "IT — Security",
  "IT — Infrastructure",
  "IT — Data",
  "IT — Product",
  "IT — Support",
  "Human Capital",
  "Finance",
  "Sales",
] as const;
