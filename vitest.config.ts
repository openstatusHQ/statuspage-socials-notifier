import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // index.ts starts a long-running Node server unless VERCEL is set; setting
    // it here keeps importing the app side-effect-free during tests.
    env: { VERCEL: "1" },
    include: ["src/**/*.test.ts"],
  },
});
