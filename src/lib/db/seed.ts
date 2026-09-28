import type { Employee } from "@/lib/types";

/**
 * Demo roster written on first boot so the dashboard is never empty.
 * Delete `data/hc-store.json` to reseed.
 *
 * Every row is ACTIVE or DISABLED, because those are the only things an account
 * can be. A seeded roster used to include people parked in approval statuses,
 * which put the directory in a state the workflow could never resolve.
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
      return {
        id: `emp_seed_${String(index + 1).padStart(3, "0")}`,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
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

/** Divisions HC can pick from. IT is split into several, which is why movements exist. */
/*
 * The divisions HC may place somebody in.
 *
 * A suggestion list rather than a closed set, and deliberately so: a company
 * grows a department before anybody updates a catalogue, and a form that
 * refuses the name of a division that exists is a form people work around.
 *
 * It includes every department already present in the directory, including
 * ones typed in before this list covered them. A catalogue that does not
 * recognise its own records teaches people to ignore it.
 */
/**
 * A catalogue entry: a heading and the options under it.
 *
 * The grouping is data rather than a comment because it is shown. Forty-seven
 * job titles in one flat list is a wall; the same list under seven headings is
 * something you can skim to the right neighbourhood and stop.
 */
export interface CatalogueGroup {
  readonly label: string;
  readonly items: readonly string[];
}

/*
 * The divisions HC may place somebody in.
 *
 * A suggestion list rather than a closed set, deliberately: a company grows a
 * department before anybody updates a catalogue, and a form that refuses the
 * name of a division that exists is a form people work around.
 *
 * It includes every department already present in the directory, including
 * ones typed in before this list covered them. A catalogue that does not
 * recognise its own records teaches people to ignore it.
 */
export const DEPARTMENT_GROUPS: readonly CatalogueGroup[] = [
  {
    label: "Front office",
    items: [
      "Investment Banking",
      "Institutional Sales",
      "Retail Brokerage",
      "Equity Research",
      "Fixed Income",
      "Treasury",
      "Sales",
      "Research",
    ],
  },
  {
    label: "Middle & back office",
    items: [
      "Risk Management",
      "Compliance",
      "Internal Audit",
      "Operations",
      "Settlement",
      "Legal",
    ],
  },
  {
    label: "Korporat",
    items: [
      "Human Capital",
      "Finance",
      "Accounting",
      "Marketing",
      "Corporate Secretary",
      "General Affairs",
      "Procurement",
      "Customer Care",
    ],
  },
  {
    label: "Teknologi",
    items: [
      "IT — Engineering",
      "IT — Security",
      "IT — Infrastructure",
      "IT — Data",
      "IT — Product",
      "IT — Support",
      "Engineering",
      "Cyber Security",
      "Analytics",
    ],
  },
];

/*
 * The job titles offered alongside them. Same rule: the list suggests, it does
 * not constrain. Titles vary far more than divisions do, and a closed set would
 * block a legitimate hire whose title nobody thought to add.
 */
export const JOB_TITLE_GROUPS: readonly CatalogueGroup[] = [
  {
    label: "Engineering",
    items: [
      "Backend Engineer",
      "Senior Backend Engineer",
      "Frontend Engineer",
      "Senior Frontend Engineer",
      "Fullstack Engineer",
      "Mobile Engineer",
      "DevOps Engineer",
      "Site Reliability Engineer",
      "QA Engineer",
      "Senior QA Engineer",
      "Engineering Manager",
    ],
  },
  {
    label: "Data, produk, desain",
    items: [
      "Data Analyst",
      "Data Engineer",
      "Data Scientist",
      "Product Manager",
      "Product Designer",
      "UX Researcher",
      "Business Analyst",
    ],
  },
  {
    label: "Keamanan",
    items: [
      "Security Analyst",
      "Security Engineer",
      "IT Security Officer",
    ],
  },
  {
    label: "Keuangan & pasar modal",
    items: [
      "Analyst",
      "Financial Analyst",
      "Equity Analyst",
      "Investment Analyst",
      "Research Analyst",
      "Fixed Income Analyst",
      "Relationship Manager",
      "Account Officer",
      "Accounting Staff",
      "Treasury Officer",
    ],
  },
  {
    label: "Risiko, kepatuhan, hukum",
    items: [
      "Compliance Officer",
      "Risk Officer",
      "Auditor Internal",
      "Legal Officer",
    ],
  },
  {
    label: "Human Capital & korporat",
    items: [
      "HC Officer",
      "Recruiter",
      "Head of Human Capital",
      "Corporate Secretary Officer",
      "General Affairs Officer",
      "Customer Care Officer",
    ],
  },
  {
    label: "Kepemimpinan",
    items: [
      "Supervisor",
      "Assistant Manager",
      "Manager",
      "Senior Manager",
      "Head of Division",
      "Director",
    ],
  },
];

/* Flattened, for anything that needs the plain list rather than the headings. */
export const DEPARTMENTS: readonly string[] = DEPARTMENT_GROUPS.flatMap((g) => g.items);
export const JOB_TITLES: readonly string[] = JOB_TITLE_GROUPS.flatMap((g) => g.items);
