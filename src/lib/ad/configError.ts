/**
 * A deployment that has not been told which directory it is acting on.
 *
 * Its own module, and not a member of index.ts any more, because the LDAP
 * driver's configuration reader needs to throw it — and index.ts is what
 * constructs that driver. Left in index.ts the two files would import each
 * other, and the class would exist twice under a bundler that resolved the
 * cycle by duplicating it, which quietly breaks every `instanceof` check that
 * routes around a missing configuration.
 *
 * Still re-exported from `@/lib/ad`, so every existing import keeps working.
 */
export class AdConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdConfigurationError";
  }
}
