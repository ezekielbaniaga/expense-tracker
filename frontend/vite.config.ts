/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

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
