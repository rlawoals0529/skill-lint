import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /*
     * Named, not left to the default glob.
     *
     * The default matches *.spec.ts as well, so it collects the Playwright suite in e2e/ and
     * fails it with "Playwright Test did not expect test() to be called here" - a red file
     * beside green ones, which trains you to skim the summary rather than read it.
     *
     * demo/ is in here on purpose: the vendored theme and keyboard helpers carry their own
     * tests, and a vendored file whose tests nobody runs is a copy that has stopped being
     * checked.
     */
    include: ["src/**/*.test.ts", "demo/**/*.test.ts"],
  },
});
