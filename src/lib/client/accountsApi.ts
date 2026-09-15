/**
 * Browser-side calls into the account API.
 *
 * One place that knows the `{ ok, data } | { ok, error }` envelope the routes
 * return, so six forms do not each re-derive it — and, more usefully, so that
 * "the server rejected specific fields" and "the whole request failed" stay
 * distinguishable at every call site. A form needs to put the first kind next
 * to the offending input and the second kind at the top.
 */

export interface ApiFailure {
  message: string;
  /** Per-field messages from the server validators, keyed by field name. */
  fieldErrors?: Record<string, string>;
  /** Machine-readable reason, e.g. EMAIL_NOT_VERIFIED or TOKEN_EXPIRED. */
  code?: string;
  status: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

async function request<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      // The token lives in an httpOnly cookie, so it has to be sent explicitly
      // for any request that is not same-origin by default.
      credentials: "same-origin",
      ...init,
    });
  } catch {
    // A network failure, not an HTTP error: there is no status and no body.
    return {
      ok: false,
      failure: { message: "Tidak dapat menghubungi server. Periksa koneksi Anda.", status: 0 },
    };
  }

  const payload = (await response.json().catch(() => undefined)) as
    | { ok?: boolean; data?: T; error?: string; fieldErrors?: Record<string, string>; code?: string }
    | undefined;

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      failure: {
        message: payload?.error ?? "Terjadi kesalahan. Coba lagi.",
        fieldErrors: payload?.fieldErrors,
        code: payload?.code,
        status: response.status,
      },
    };
  }

  return { ok: true, data: payload.data as T };
}

export function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function putJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getJson<T>(url: string): Promise<ApiResult<T>> {
  return request<T>(url, { method: "GET" });
}

export function deleteJson<T>(url: string): Promise<ApiResult<T>> {
  return request<T>(url, { method: "DELETE" });
}
