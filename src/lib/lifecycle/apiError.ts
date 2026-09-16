import type { NextResponse } from "next/server";

import { fail } from "@/lib/http/apiResponse";

import { RoutingError, SeparationOfDutiesError } from "./routing";
import { LifecycleTransitionError } from "./stateMachine";
import { LifecycleError, type LifecycleErrorCode } from "./service";

/**
 * Turns a domain error into the right HTTP answer.
 *
 * In one place so every lifecycle route answers the same way, and so the domain
 * layer never has to import anything about HTTP to be precise about what went
 * wrong. The distinction the plan asks for is kept: 403 is "we know who you are
 * and you still may not", 409 is "the request has moved under you", 422 is
 * "what you sent cannot be accepted as written".
 */

const STATUS: Record<LifecycleErrorCode, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  INVALID: 422,
};

export function lifecycleFailure(error: unknown): NextResponse {
  if (error instanceof LifecycleError) {
    return fail(error.message, STATUS[error.code], { code: error.code });
  }

  // A clash between requester and approver is a conflict in the request, not a
  // permission problem: the person is allowed to raise requests, just not this
  // one routed this way.
  if (error instanceof SeparationOfDutiesError) {
    return fail(error.message, 409, { code: "SEPARATION_OF_DUTIES" });
  }

  if (error instanceof RoutingError) {
    return fail(error.message, 422, { code: "ROUTING" });
  }

  if (error instanceof LifecycleTransitionError) {
    return fail(error.message, 409, {
      code: "INVALID_TRANSITION",
      from: error.from,
      to: error.to,
    });
  }

  // Anything unrecognised is a bug, not a message to hand the caller.
  console.error("[lifecycle]", error);
  return fail("Gagal memproses pengajuan.", 500);
}
