import { defineConfig, devices } from "@playwright/test";

/**
 * The demo, in a real browser.
 *
 * The rules are covered by the unit tests, which need no page. What needs one is the claim
 * the demo makes: that the same `lintSkills` runs here, and that the rules it CANNOT run are
 * named rather than quietly skipped - which is a property of the page, not of the linter.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 30_000,
  // The demo is served from a subdirectory, the way Pages serves it.
  use: { baseURL: "http://127.0.0.1:4179/demo/", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Static files off disk: the demo is plain HTML importing the built library, so there is
    // nothing to bundle. The host is bound explicitly because "localhost" resolves to ::1 on
    // some machines and the health check then waits out its timeout against a server that is
    // up and listening somewhere else.
    command: "npm run build && npm run build:demo && npx --yes http-server -p 4179 -a 127.0.0.1 -s .",
    url: "http://127.0.0.1:4179/demo/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
