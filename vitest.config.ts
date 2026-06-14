import { defineConfig } from "vitest/config";
import path from "path";

// Unit tests for the scheduling engine run in a plain Node environment — the
// engine is framework-free, so no DOM/jsdom is needed.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
