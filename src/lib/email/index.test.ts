import { afterEach, describe, expect, it, vi } from "vitest";

import { EmailConfigurationError, getEmailDriver, isEmailConfigured, resetEmailDriver } from ".";

/**
 * Which provider gets chosen, and what is refused.
 *
 * This is a security check more than a configuration one: approval emails
 * quietly written to a local folder while the dashboard reports them as sent is
 * the failure this prevents.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  resetEmailDriver();
});

describe("choosing a driver", () => {
  it("refuses to guess when nothing is configured", () => {
    vi.stubEnv("EMAIL_DRIVER", "");
    resetEmailDriver();

    expect(() => getEmailDriver()).toThrow(EmailConfigurationError);
    expect(isEmailConfigured()).toBe(false);
  });

  it("gives the file driver outside production", () => {
    vi.stubEnv("EMAIL_DRIVER", "file");
    vi.stubEnv("NODE_ENV", "development");
    resetEmailDriver();

    const driver = getEmailDriver();
    expect(driver.name).toBe("file");
    expect(driver.simulated).toBe(true);
  });

  it("refuses the file driver in production", () => {
    vi.stubEnv("EMAIL_DRIVER", "file");
    vi.stubEnv("NODE_ENV", "production");
    resetEmailDriver();

    expect(() => getEmailDriver()).toThrow(/production/);
  });

  it("fails loudly for graph rather than falling back to a folder", () => {
    vi.stubEnv("EMAIL_DRIVER", "graph");
    resetEmailDriver();

    expect(() => getEmailDriver()).toThrow(EmailConfigurationError);
  });

  it("rejects an unrecognised fault mode instead of ignoring it", () => {
    vi.stubEnv("EMAIL_DRIVER", "file");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("EMAIL_FAULT", "explode");
    resetEmailDriver();

    expect(() => getEmailDriver()).toThrow(/EMAIL_FAULT/);
  });
});
