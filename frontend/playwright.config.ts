import { defineConfig, devices } from "@playwright/test";

// Runs against the e2e Compose stack, which run_e2e.sh starts (so no webServer here).
// One worker: the specs share one backend and wait on real token lifetimes.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:18081",
    // The date field defaults to today here, and the server rejects dates later than today in UTC+14, so today in UTC is always accepted
    timezoneId: "UTC",
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
