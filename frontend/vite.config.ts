/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// No changeOrigin: the Origin header must stay http://localhost:5173,
// because the backend checks it on cookie refresh/logout.
const backend = { target: "http://localhost:8080" };

export default defineConfig({
  plugins: [react()],
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
  },
});
