/**
 * A small fixed-window rate limiter for the credential routes.
 *
 * SCOPE, PLAINLY: this counts in the memory of one process. It is real
 * protection for a single-instance deployment and for casual scripted guessing,
 * and it is NOT enough on its own in production, because
 *
 *   - every serverless instance or container keeps its own counter, so the
 *     effective limit multiplies by the number of instances, and
 *   - the counters reset on every deploy and every cold start.
 *
 * For production, move this to a shared store — Redis, Upstash, or your
 * platform's own edge rate limiting — keeping the same call sites. The
 * interface here is deliberately the one such a store would offer, so that
 * change is a swap of this file rather than an edit to every route.
 */

interface Window {
  count: number;
  /** When the current window ends, ms since epoch. */
  resetAt: number;
}

const buckets = new Map<string, Window>();

/**
 * Dropped entries are only rebuilt on the next request, so an occasional sweep
 * is enough to stop the map growing without bound on a long-lived process.
 */
function sweep(now: number): void {
  if (buckets.size < 5_000) return;
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Seconds until the window resets — what goes in `Retry-After`. */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  const window =
    existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

  window.count += 1;
  buckets.set(key, window);

  const retryAfter = Math.max(1, Math.ceil((window.resetAt - now) / 1000));

  return {
    allowed: window.count <= limit,
    remaining: Math.max(0, limit - window.count),
    retryAfter,
  };
}

/** Clears a key after a success, so a correct login does not count against the next one. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/**
 * Best-effort client identity.
 *
 * `x-forwarded-for` is set by the proxy in front of the app and can be forged
 * when nothing trustworthy sets it, so this is a throttle, not an
 * authorisation check. Behind a CDN, prefer the platform's verified client-IP
 * header instead.
 */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}
