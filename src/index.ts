import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, basename } from "node:path";

export type Severity = "error" | "warn";

export interface Finding {
  severity: Severity;
  rule: string;
  skill: string;
  message: string;
  file?: string;
}

export interface Skill {
  name: string;
  dir: string;
  file: string;
  description: string;
  body: string;
  lines: number;
}

/** Frontmatter values may be plain, quoted, or a `>-` folded block. */
function frontmatter(src: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  if (!m) return {};
  const out: Record<string, string> = {};
  const lines = m[1]!.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!;
    let value = kv[2]!.trim();
    if (value === ">-" || value === ">" || value === "|" || value === "|-") {
      const folded: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) folded.push(lines[++i]!.trim());
      value = folded.join(" ");
    }
    out[key] = value.replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Trigger phrases are the quoted strings in a description. That is what a model routes on. */
export function triggersOf(description: string): string[] {
  return [...description.matchAll(/["“]([^"”]{3,60})["”]/g)]
    .map((m) => m[1]!.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

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
      const src = readFileSync(file, "utf8");
      const fm = frontmatter(src);
      found.push({
        name: fm.name ?? "",
        dir,
        file,
        description: fm.description ?? "",
        body: src,
        lines: src.split("\n").length,
      });
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

/** Fenced blocks hold example output, not references. Blank them, keeping length. */
function withoutFences(text: string): string {
  return text.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, (block) => block.replace(/[^\n]/g, " "));
}

/** Markdown links and inline-code paths that look like files this skill points at. */
function referencedPaths(skill: Skill): string[] {
  const out = new Set<string>();
  const body = withoutFences(skill.body);
  for (const m of body.matchAll(/\]\(([^)\s]+)\)/g)) {
    const t = m[1]!;
    if (!/^(https?:|#|mailto:)/.test(t)) out.add(t.split("#")[0]!);
  }
  for (const m of body.matchAll(/`([^`\n]*\/[^`\n]*\.(md|js|ts|py|sh|json|yml|yaml))`/g)) {
    out.add(m[1]!);
  }
  return [...out].filter(isCheckablePath);
}

/**
 * A path is only checkable if it names one real file.
 *
 * Globs, templated placeholders and anything with whitespace are patterns or commands that
 * happen to match the shape of a path. Reporting them buries the real broken references.
 */
function isCheckablePath(p: string): boolean {
  if (!p) return false;
  if (/[*?<>{}\s]/.test(p)) return false;
  return true;
}

/** Outside the skill directory there is no repo to resolve against, so it cannot be an error. */
function isPortable(p: string): boolean {
  return !p.startsWith("~") && !p.startsWith("/") && !p.startsWith("..");
}

export interface Options {
  /** A skill longer than this will crowd the context window. */
  maxLines?: number;
  /** Descriptions shorter than this give a model too little to route on. */
  minDescription?: number;
  /** Descriptions longer than this are usually a second copy of the body. */
  maxDescription?: number;
}

export function lint(root: string, opts: Options = {}): Finding[] {
  const maxLines = opts.maxLines ?? 500;
  const minDescription = opts.minDescription ?? 40;
  const maxDescription = opts.maxDescription ?? 1024;

  const skills = findSkills(root);
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);
  const names = new Set(skills.map((s) => s.name).filter(Boolean));

  for (const s of skills) {
    const label = s.name || relative(root, s.dir) || basename(s.dir);

    if (!s.name) {
      add({ severity: "error", rule: "missing-name", skill: label, file: s.file,
            message: "Frontmatter has no `name`. The harness cannot register this skill." });
    } else if (s.name !== basename(s.dir)) {
      add({ severity: "error", rule: "name-mismatch", skill: label, file: s.file,
            message: `Frontmatter name "${s.name}" does not match directory "${basename(s.dir)}". Invocation uses one, the filesystem the other.` });
    }

    if (!s.description) {
      add({ severity: "error", rule: "missing-description", skill: label, file: s.file,
            message: "Frontmatter has no `description`. Nothing tells the model when to use this." });
    } else {
      if (s.description.length < minDescription) {
        add({ severity: "warn", rule: "thin-description", skill: label, file: s.file,
              message: `Description is ${s.description.length} chars. Too little for a model to route on; say when to use it, not just what it is.` });
      }
      if (s.description.length > maxDescription) {
        add({ severity: "warn", rule: "bloated-description", skill: label, file: s.file,
              message: `Description is ${s.description.length} chars. Past roughly ${maxDescription} it is a second copy of the body and costs context on every turn.` });
      }
      if (triggersOf(s.description).length === 0) {
        add({ severity: "warn", rule: "no-triggers", skill: label, file: s.file,
              message: "No quoted trigger phrases in the description. Routing falls back to a paraphrase match." });
      }
    }

    if (s.lines > maxLines) {
      add({ severity: "warn", rule: "context-bloat", skill: label, file: s.file,
            message: `${s.lines} lines. Past ~${maxLines} the body should be split into references/ and pointed at, not inlined.` });
    }

    for (const ref of referencedPaths(s)) {
      if (!isPortable(ref)) {
        add({ severity: "warn", rule: "unportable-reference", skill: label, file: s.file,
              message: `Points at \`${ref}\`, outside the skill directory. Anyone installing this elsewhere gets a dead pointer.` });
        continue;
      }
      if (!existsSync(join(dirname(s.file), ref))) {
        add({ severity: "error", rule: "broken-reference", skill: label, file: s.file,
              message: `Points at \`${ref}\`, which does not exist. A skill that references a missing file fails only when someone runs it.` });
      }
    }

    for (const m of withoutFences(s.body).matchAll(/`\/([a-z][a-z0-9-]{2,})`/g)) {
      const invoked = m[1]!;
      if (!names.has(invoked) && skills.length > 1) {
        add({ severity: "warn", rule: "unknown-skill-reference", skill: label, file: s.file,
              message: `Invokes \`/${invoked}\`, which is not a skill in this tree. It will be a dead pointer for anyone installing from here.` });
      }
    }
  }

  const seen = new Map<string, string[]>();
  for (const s of skills) {
    for (const t of triggersOf(s.description)) {
      seen.set(t, [...(seen.get(t) ?? []), s.name || basename(s.dir)]);
    }
  }
  for (const [trigger, owners] of seen) {
    if (owners.length > 1) {
      add({ severity: "warn", rule: "trigger-collision", skill: owners.join(", "),
            message: `Trigger "${trigger}" is claimed by ${owners.length} skills. Which one fires is a coin flip.` });
    }
  }

  const order: Record<Severity, number> = { error: 0, warn: 1 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity] || a.rule.localeCompare(b.rule));
}
