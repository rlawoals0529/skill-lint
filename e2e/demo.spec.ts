import { expect, test } from "@playwright/test";

/**
 * What the demo claims, checked in the browser it claims it about.
 *
 * The rules themselves are unit-tested and need no page. These are the two things only a
 * page can be wrong about: that the linter really runs here, and that the rules it cannot
 * run are named instead of quietly skipped.
 */

test("the server under test is this app, not another app on the same port", async ({ page }) => {
  await page.goto("./");
  await expect(page).toHaveTitle(/^skill-lint/);
});

test("it opens on a set that fails, because a clean report teaches nothing", async ({ page }) => {
  await page.goto("./");

  // An empty box and a clean report are both "nothing to read". The first thing a visitor
  // meets should be the tool doing its job.
  const findings = page.locator(".finding");
  expect(await findings.count()).toBeGreaterThan(0);
  await expect(page.locator("#summary")).toContainText(/\d+ skills checked/);
});

test("the rules it cannot run here are named, not quietly skipped", async ({ page }) => {
  await page.goto("./");

  /*
   * This is the whole reason the page is honest. `lintSkills` skips broken-reference when no
   * existence check is injected, and the demo drops name-mismatch because pasted text has no
   * directory - so a clean report here is not the same claim the CLI's clean report makes,
   * and the page has to say which rules did not run.
   */
  const named = await page.locator(".cannot code").allTextContents();
  expect(named).toContain("broken-reference");
  expect(named).toContain("name-mismatch");

  // And neither ever appears as a finding, which would be the rule running on a guess.
  await page.getByRole("button", { name: "A set that fails" }).click();
  const rules = await page.locator(".finding").evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.rule),
  );
  expect(rules).not.toContain("broken-reference");
  expect(rules).not.toContain("name-mismatch");
});

test("a colliding trigger is reported, and naming the skills is the point of it", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "A set that fails" }).click();

  const collision = page.locator('.finding[data-rule="trigger-collision"]');
  await expect(collision).toHaveCount(1);
  // Both owners, because "a trigger is claimed twice" is useless without knowing by whom.
  await expect(collision.locator(".who")).toContainText("pr-review-followup");
  await expect(collision.locator(".who")).toContainText("code-quality");
});

test("a set with nothing wrong says so rather than showing an empty report", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Two real skills" }).click();

  await expect(page.locator(".finding")).toHaveCount(0);
  // An empty pre is indistinguishable from a page that failed to run.
  await expect(page.locator(".clean")).toBeVisible();
  await expect(page.locator("#summary")).toContainText("0 errors");
});

test("editing a skill re-lints it without pressing anything", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Two real skills" }).click();
  await expect(page.locator(".clean")).toBeVisible();

  // Claim a trigger the other skill already owns.
  const first = page.locator(".editor textarea").first();
  await first.fill((await first.inputValue()).replace('"write the changelog"', '"flaky test"'));

  await expect(page.locator('.finding[data-rule="trigger-collision"]')).toHaveCount(1);
});
