/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

// Intl output depends on the machine's zone and locale; pin both so Vitest is the same everywhere.
// Set here, before the workers start, because ICU reads them at process start.
process.env.TZ = "UTC";
process.env.LC_ALL = "en_US.UTF-8";
process.env.LANG = "en_US.UTF-8";

// No changeOrigin: the Origin header must stay http://localhost:5173,
// because the backend checks it on cookie refresh/logout.
const backend = { target: "http://localhost:8080" };

export default defineConfig({
  plugins: [react()],
  // Never inline assets as data: URIs, so the fonts stay separate hashed files that can be preloaded
  build: { assetsInlineLimit: 0 },
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/auth": backend,
      "/users": backend,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    // e2e/ holds the Playwright specs, which run against the Compose stack (run_e2e.sh)
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
