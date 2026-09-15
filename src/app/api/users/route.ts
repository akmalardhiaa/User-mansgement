import { getActorName } from "@/lib/auth/current";
import { DuplicateEmailError, addEmployee, listEmployees } from "@/lib/db/repository";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { parseNewUserInput } from "@/lib/validation/userInput";

export const dynamic = "force-dynamic";

/** GET /api/users — the roster rendered by the directory. */
export async function GET() {
  return ok({ employees: await listEmployees() });
}

/**
 * POST /api/users — add a new employee to the directory.
 *
 * The account is active immediately: there is no approval workflow any more.
 */
export async function POST(request: Request) {
  const parsed = parseNewUserInput(await readJson(request));
  if (!parsed.ok) {
    return fail("Perbaiki isian yang ditandai.", 422, { fieldErrors: parsed.errors });
  }

  try {
    const employee = await addEmployee(parsed.value, await getActorName());
    return ok({ employee }, 201);
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      return fail(error.message, 409, { fieldErrors: { email: error.message } });
    }
    console.error("[api/users] create failed:", error);
    return fail("Gagal menambahkan karyawan.", 500);
  }
}
