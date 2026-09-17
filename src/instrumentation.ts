/**
 * Startup hook. Next calls `register` once per server instance.
 *
 * Used here for one thing: starting the loop that sends the approval emails the
 * outbox owes. Without it nothing does — the dispatcher had no caller but a
 * button, so a queued message waited on somebody pressing it.
 *
 * `register` must return before the server accepts requests, so this starts a
 * timer and returns. It never awaits a dispatch.
 */
export async function register(): Promise<void> {
  // Called in every runtime. The scheduler needs Node: timers it can unref, and
  // a store backed by the filesystem.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Imported here rather than at the top of the file, per the Next guide, so
  // the module graph is not pulled into a runtime that cannot run it.
  const { startOutboxSchedulerFromEnv } = await import("@/lib/lifecycle/scheduler");
  startOutboxSchedulerFromEnv();
}
