import { fail } from "@/lib/http/apiResponse";

import { ApprovalError } from "./service";

/**
 * Turns a thrown error into the response a route should send. Anything that is
 * not an ApprovalError is unexpected, so it is logged and answered with a 500
 * that says nothing about the internals.
 */
export function approvalFailure(error: unknown, scope: string) {
  if (error instanceof ApprovalError) {
    return fail(error.message, error.status, { code: error.code });
  }
  console.error(`[${scope}]`, error);
  return fail("Terjadi kesalahan di server. Coba lagi.", 500);
}
