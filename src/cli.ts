#!/usr/bin/env node
import { lint, findSkills, type Finding } from "./index.js";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? Number(args[i + 1]) : undefined;
};
const root = args.find((a) => !a.startsWith("-") && Number.isNaN(Number(a))) ?? ".";
const warnOnly = args.includes("--warn-only");

if (args.includes("-h") || args.includes("--help")) {
  console.log(`skill-lint [dir] [options]

  --max-lines N        Flag a skill longer than N lines (default 500)
  --min-description N  Flag a description shorter than N chars (default 40)
  --max-description N  Flag a description longer than N chars (default 1024)
  --warn-only          Always exit 0
`);
  process.exit(0);
}

const skills = findSkills(root);
const findings = lint(root, {
  maxLines: flag("--max-lines"),
  minDescription: flag("--min-description"),
  maxDescription: flag("--max-description"),
});

const colour = process.stdout.isTTY;
const red = (s: string) => (colour ? `\x1b[31m${s}\x1b[0m` : s);
const yellow = (s: string) => (colour ? `\x1b[33m${s}\x1b[0m` : s);
const dim = (s: string) => (colour ? `\x1b[2m${s}\x1b[0m` : s);

if (skills.length === 0) {
  console.error(`No SKILL.md found under ${root}`);
  process.exit(1);
}

const byRule = new Map<string, Finding[]>();
for (const f of findings) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);

for (const [rule, group] of byRule) {
  const sev = group[0]!.severity;
  console.log(`\n${sev === "error" ? red("error") : yellow("warn ")}  ${rule}`);
  for (const f of group) {
    console.log(`  ${f.skill}`);
    console.log(`    ${f.message}`);
    if (f.file) console.log(dim(`    ${f.file}`));
  }
}

const errors = findings.filter((f) => f.severity === "error").length;
const warns = findings.length - errors;
console.log(
  `\n${skills.length} skill${skills.length === 1 ? "" : "s"} checked  ·  ` +
    `${errors} error${errors === 1 ? "" : "s"}  ·  ${warns} warning${warns === 1 ? "" : "s"}`,
);
process.exit(errors > 0 && !warnOnly ? 1 : 0);
