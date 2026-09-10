/**
 * The filesystem layer: find skills on disk, then hand them to the pure rules in `core`.
 *
 * Everything that can run without a filesystem lives in `./core` so a browser can use it.
 * Nothing is duplicated here — this file walks directories and answers "does that file
 * exist", and that is all it does.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, basename } from "node:path";
import { lintSkills, parseSkill, type Options, type Finding, type Skill } from "./core.js";

export * from "./core.js";

export function findSkills(root: string): Skill[] {
  const found: Skill[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    if (entries.includes("SKILL.md")) {
      const file = join(dir, "SKILL.md");
      found.push(parseSkill(readFileSync(file, "utf8"), { dir, file }));
      return;
    }
    for (const e of entries) {
      if (e === "node_modules" || e.startsWith(".")) continue;
      const p = join(dir, e);
      try {
        if (statSync(p).isDirectory()) walk(p, depth + 1);
      } catch { /* unreadable, skip */ }
    }
  };
  walk(root, 0);
  return found;
}

export function lint(root: string, opts: Options = {}): Finding[] {
  return lintSkills(findSkills(root), {
    ...opts,
    refExists: (skill, ref) => existsSync(join(dirname(skill.file), ref)),
    labelOf: (s) => s.name || relative(root, s.dir) || basename(s.dir),
  });
}
