import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit tests only: pure logic and components, no network, no database.
// Database tests live in tests/db and run through vitest.db.config.ts against an
// isolated test project only (see tests/README.md).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    environment: "node",
    reporters: ["default", "junit"],
    outputFile: { junit: "test-results/unit-junit.xml" },
  },
});
