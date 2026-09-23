import { defineConfig } from "@playwright/test"

// Attach to the developer's already-running Chrome (CDP :9222): the
// logged-in session is the auth — no login automation. Dev server must
// already be running; tests fail fast if not.
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1, // serial: one shared browser tab, one shared record
  reporter: [["list"], ["json", { outputFile: "e2e/reports/report.json" }]],
  use: {
    baseURL: process.env.E2E_APP_URL || "http://localhost:3000",
    channel: "chrome", // installed Chrome; CDP attach is what matters
  },
})
