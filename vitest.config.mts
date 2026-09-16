import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Unit tests for the domain layer.
 *
 * Node environment, no jsdom: what is tested here is the lifecycle state
 * machine, payload hashing, and routing rules — logic that must hold regardless
 * of any UI, and that the implementation plan requires to be provable in CI
 * rather than demonstrated by hand.
 *
 * `.mts` rather than `.ts` because this project is CommonJS by default, and a
 * `.ts` config using ESM syntax makes Vite load it through a compatibility path
 * it warns about. Setting `"type": "module"` project-wide would fix it too, but
 * would change how every other config file in the repo is interpreted.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
