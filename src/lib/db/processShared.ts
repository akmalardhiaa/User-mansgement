/**
 * State that must exist once per process, not once per copy of a module.
 *
 * Next compiles a server file separately for every layer that imports it. Route
 * handlers get an `[app-route]` copy, pages an `[app-rsc]` copy, and
 * instrumentation.ts, which runs the outbox and worker schedulers, gets an
 * `[instrumentation]` copy. Each copy has its own module-level variables, so a
 * lock kept in one was really three locks.
 *
 * On 22 September 2026 that lost a manager's approval. The approval route saved
 * the decision and answered 200. The outbox dispatcher had read the store a few
 * milliseconds earlier and then saved "email sent" over it. The request stayed
 * at "waiting for the manager", and the link in the email still worked.
 *
 * `globalThis` is the one object every copy shares. The state lives there,
 * under a registered symbol so that every copy uses the same key.
 */
export function processShared<T>(name: string, create: () => T): T {
  const holder = globalThis as unknown as Record<symbol, T | undefined>;
  const key = Symbol.for(`hc-portal:${name}`);
  holder[key] ??= create();
  return holder[key];
}

/**
 * A promise-chain lock: tasks run one at a time, in the order they arrived.
 * Node is single-threaded, but `await` points interleave, so without it two
 * read-modify-write cycles can read the same snapshot and one save overwrites
 * the other.
 */
export function processLock(name: string): <T>(task: () => Promise<T>) => Promise<T> {
  const state = processShared(`lock:${name}`, () => ({ tail: Promise.resolve() as Promise<unknown> }));
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = state.tail.then(task, task);
    state.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
