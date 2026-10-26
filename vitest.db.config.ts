import { defineConfig } from "vitest/config";

// Database tests: real RPCs and RLS against an ISOLATED test Supabase project.
// tests/db/guard.ts aborts the run as BLOCKED unless isolation is proven.
export default defineConfig({
  test: {
    include: ["tests/db/**/*.db.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    fileParallelism: false,
    reporters: ["default", "junit"],
    outputFile: { junit: "test-results/db-junit.xml" },
  },
});
