/**
 * Everything that does not touch a filesystem.
 *
 * Split out so the same parsing and the same rules run in a browser, where there is no
 * `node:fs` to import. `index.ts` keeps the directory walk and the existence check and
 * calls into here; nothing is duplicated between them.
 */

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

/** Last path segment, without needing `node:path`. Handles both separators. */
export function baseName(p: string): string {
  const parts = p.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

/** Frontmatter values may be plain, quoted, or a `>-` folded block. */
export function frontmatter(src: string): Record<string, string> {
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

/** Build a Skill from raw text. The browser path has no directory, so it passes one in. */
export function parseSkill(source: string, opts: { dir?: string; file?: string } = {}): Skill {
  const fm = frontmatter(source);
  const dir = opts.dir ?? fm.name ?? "";
  return {
    name: fm.name ?? "",
    dir,
    file: opts.file ?? (dir ? `${dir}/SKILL.md` : "SKILL.md"),
    description: fm.description ?? "",
    body: source,
    lines: source.split("\n").length,
  };
}

/** Trigger phrases are the quoted strings in a description. That is what a model routes on. */
export function triggersOf(description: string): string[] {
  return [...description.matchAll(/["“]([^"”]{3,60})["”]/g)]
    .map((m) => m[1]!.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

/** Fenced blocks hold example output, not references. Blank them, keeping length. */
export function withoutFences(text: string): string {
  return text.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, (block) => block.replace(/[^\n]/g, " "));
}

/**
 * A path is only checkable if it names one real file.
 *
 * Globs, templated placeholders and anything with whitespace are patterns or commands that
 * happen to match the shape of a path. Reporting them buries the real broken references.
 */
export function isCheckablePath(p: string): boolean {
  if (!p) return false;
  if (/[*?<>{}\s]/.test(p)) return false;
  return true;
}

/** Outside the skill directory there is no repo to resolve against, so it cannot be an error. */
export function isPortable(p: string): boolean {
  return !p.startsWith("~") && !p.startsWith("/") && !p.startsWith("..");
}

/** Markdown links and inline-code paths that look like files this skill points at. */
export function referencedPaths(skill: Skill): string[] {
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
 * A skill may waive a rule for itself with a line like:
 *
 *   <!-- skill-lint disable trigger-collision -->
 *
 * An escape hatch is not a weakness in a linter, it is what stops one being switched off
 * wholesale the first time it is confidently wrong. Waivers are per rule and per skill,
 * never global.
 */
export function waived(skill: Skill): Set<string> {
  const out = new Set<string>();
  for (const m of skill.body.matchAll(/<!--\s*skill-lint\s+disable\s+([a-z-]+(?:\s*,\s*[a-z-]+)*)\s*-->/g)) {
    for (const rule of m[1]!.split(",")) out.add(rule.trim());
  }
  return out;
}

export interface Options {
  /** A skill longer than this will crowd the context window. */
  maxLines?: number;
  /** Descriptions shorter than this give a model too little to route on. */
  minDescription?: number;
  /** Descriptions longer than this are usually a second copy of the body. */
  maxDescription?: number;
  /**
   * Whether a path referenced by a skill exists, relative to that skill's directory.
   *
   * Omitted in a browser, where there is no filesystem to ask. The broken-reference rule is
   * then skipped rather than guessed at — a linter that cannot check something must say
   * nothing about it, not assume the happy answer.
   */
  refExists?: (skill: Skill, ref: string) => boolean;
  /** Label for a skill with no frontmatter name. Defaults to its directory's last segment. */
  labelOf?: (skill: Skill) => string;
}

/** Run every rule over already-loaded skills. No filesystem, no I/O. */
export function lintSkills(skills: Skill[], opts: Options = {}): Finding[] {
  const maxLines = opts.maxLines ?? 500;
  const minDescription = opts.minDescription ?? 40;
  const maxDescription = opts.maxDescription ?? 1024;
  const labelOf = opts.labelOf ?? ((s: Skill) => s.name || baseName(s.dir));

  const waivers = new Map(skills.map((s) => [s.name || baseName(s.dir), waived(s)]));
  const findings: Finding[] = [];
  const add = (f: Finding) => {
    // A collision names every owner, so it is waived only if every one of them waived it.
    const owners = f.skill.split(",").map((s) => s.trim());
    if (owners.every((o) => waivers.get(o)?.has(f.rule))) return;
    findings.push(f);
  };
  const names = new Set(skills.map((s) => s.name).filter(Boolean));

  for (const s of skills) {
    const label = labelOf(s);

    if (!s.name) {
      add({ severity: "error", rule: "missing-name", skill: label, file: s.file,
            message: "Frontmatter has no `name`. The harness cannot register this skill." });
    } else if (s.name !== baseName(s.dir)) {
      add({ severity: "error", rule: "name-mismatch", skill: label, file: s.file,
            message: `Frontmatter name "${s.name}" does not match directory "${baseName(s.dir)}". Invocation uses one, the filesystem the other.` });
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
      if (opts.refExists && !opts.refExists(s, ref)) {
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
      seen.set(t, [...(seen.get(t) ?? []), s.name || baseName(s.dir)]);
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
