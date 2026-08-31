import { NextResponse } from "next/server";

/** Consistent JSON envelopes so the client can branch on `ok` alone. */

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/** Parses a JSON body, tolerating an empty or malformed payload. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
