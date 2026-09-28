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

  // And the worker, so an approved request is carried out without anybody
  // having to press "Jalankan worker".
  const { startWorkerSchedulerFromEnv } = await import("@/lib/lifecycle/workerScheduler");
  startWorkerSchedulerFromEnv();

  /*
   * A first run fills the simulated directory from the roster, so a freshly
   * cloned copy can demonstrate a Movement or a Termination rather than
   * failing on an account that was never created. Deliberately not awaited:
   * `register` must return before the server accepts requests, and a fixture
   * is not worth delaying that for. Failures are logged and nothing else —
   * the portal runs perfectly well with an empty directory, and an onboarding
   * creates its own account.
   */
  const { seedMockAdOnFirstRun } = await import("@/lib/ad/bootstrapMockAd");
  void seedMockAdOnFirstRun().catch((error) => {
    console.error("[bootstrap] pengisian direktori simulasi gagal", error);
  });
}
