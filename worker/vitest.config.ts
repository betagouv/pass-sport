import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Container startup + pulls are slow; give hooks and tests generous budgets.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // One worker/queue/DB stack shared per file — keep files serial to avoid
    // cross-test interference on the shared Redis queue.
    fileParallelism: false,
  },
});
