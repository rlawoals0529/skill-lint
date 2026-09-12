#!/usr/bin/env node
/**
 * Inline examples/ into the demo.
 *
 * The page opens on a real set of skills rather than an empty box, and it does it with no
 * request - so the sources have to be in the bundle. Generated rather than pasted, because a
 * second copy of a file is a copy that drifts: these are the same skills the CLI's own tests
 * run against, and a demo showing a stale version of them is a demo of nothing.
 *
 * CI checks the output is current.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dirs = readdirSync("examples", { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

if (dirs.length < 2) {
  // One skill cannot collide with anything, and trigger-collision is the rule worth showing.
  console.error(`only ${dirs.length} example(s) in examples/, which cannot demonstrate a collision`);
  process.exit(1);
}

const sources = dirs.map((d) => readFileSync(join("examples", d, "SKILL.md"), "utf8"));

writeFileSync(
  "demo/examples.ts",
  `/**
 * The example skills, inlined.
 *
 * Inlined rather than fetched so the page has a real set on first paint with no request, and
 * generated from examples/ by scripts/sync-examples.mjs so the copy here cannot drift from
 * the ones the CLI is tested against.
 */
export const EXAMPLES: readonly string[] = [
${sources.map((s) => `  ${JSON.stringify(s)},`).join("\n")}
];
`,
);

console.log(`Inlined ${dirs.length} examples into demo/examples.ts`);
