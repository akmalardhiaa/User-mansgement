import { describe, expect, it } from "vitest";

import * as route from "./route";

/**
 * A regression guard for a removed bypass.
 *
 * PUT used to write a profile — department included — straight to the record
 * with no approval. Profile edits are now PROFILE_UPDATE requests. If a PUT
 * handler ever comes back here, it brings the bypass back with it.
 */
describe("/api/users/[id]", () => {
  it("offers no way to write a profile without an approval", () => {
    expect(Object.keys(route)).not.toContain("PUT");
    expect(Object.keys(route)).not.toContain("PATCH");
    expect(Object.keys(route)).toContain("GET");
  });
});
