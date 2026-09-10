import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lint, findSkills, triggersOf } from "./index.js";

let root: string;
const skill = (name: string, frontmatter: string, body = "") => {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\n${body}`);
  return dir;
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "skill-lint-"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("discovery", () => {
  it("finds a skill and reads its frontmatter", () => {
    skill("alpha", 'name: alpha\ndescription: Does a thing. Use when you want "the thing done".');
    const found = findSkills(root).find((s) => s.name === "alpha");
    expect(found?.description).toContain("Does a thing");
  });
});

describe("triggers", () => {
  it("pulls quoted phrases out of a description", () => {
    expect(triggersOf('Use when "run the audit" or "check the diff".')).toEqual([
      "run the audit",
      "check the diff",
    ]);
  });
  it("returns nothing when a description quotes nothing", () => {
    expect(triggersOf("Just prose, no triggers at all.")).toEqual([]);
  });
});

describe("rules", () => {
  it("flags a name that does not match its directory", () => {
    skill("beta", 'name: not-beta\ndescription: A description long enough to pass the length check here.');
    const f = lint(root).find((x) => x.rule === "name-mismatch" && x.skill === "not-beta");
    expect(f?.severity).toBe("error");
  });

  it("flags a reference to a file that does not exist", () => {
    skill("gamma", 'name: gamma\ndescription: A description long enough to pass the length check here.',
      "See [the notes](references/missing.md) for detail.");
    const f = lint(root).find((x) => x.rule === "broken-reference" && x.skill === "gamma");
    expect(f?.severity).toBe("error");
    expect(f?.message).toContain("references/missing.md");
  });

  it("does not flag a reference that resolves", () => {
    const dir = skill("delta", 'name: delta\ndescription: A description long enough to pass the length check here.',
      "See [the notes](references/real.md).");
    mkdirSync(join(dir, "references"), { recursive: true });
    writeFileSync(join(dir, "references", "real.md"), "content");
    expect(lint(root).find((x) => x.rule === "broken-reference" && x.skill === "delta")).toBeUndefined();
  });

  it("flags the same trigger claimed by two skills", () => {
    skill("eps", 'name: eps\ndescription: One thing. Triggers on "shared phrase" and more text here.');
    skill("zeta", 'name: zeta\ndescription: Another thing. Triggers on "shared phrase" and more text here.');
    const f = lint(root).find((x) => x.rule === "trigger-collision");
    expect(f?.message).toContain("shared phrase");
  });

  it("flags a description too thin to route on", () => {
    skill("eta", "name: eta\ndescription: Short.");
    expect(lint(root).find((x) => x.rule === "thin-description" && x.skill === "eta")).toBeDefined();
  });

  it("flags a body long enough to crowd the context window", () => {
    skill("theta", 'name: theta\ndescription: A description long enough to pass the length check here.',
      "line\n".repeat(600));
    const f = lint(root, { maxLines: 500 }).find((x) => x.rule === "context-bloat" && x.skill === "theta");
    expect(f).toBeDefined();
    // The count includes frontmatter, so assert the threshold rather than a literal.
    const reported = Number(/(\d+) lines/.exec(f!.message)?.[1]);
    expect(reported).toBeGreaterThan(500);
  });

  it("flags an invocation of a skill that is not in the tree", () => {
    skill("iota", 'name: iota\ndescription: A description long enough to pass the length check here.',
      "Run `/nonexistent-skill` first.");
    expect(lint(root).find((x) => x.rule === "unknown-skill-reference" && x.skill === "iota")).toBeDefined();
  });

  it("does not flag an invocation of a skill that is present", () => {
    skill("kappa", 'name: kappa\ndescription: A description long enough to pass the length check here.',
      "Run `/alpha` first.");
    expect(lint(root).find((x) => x.rule === "unknown-skill-reference" && x.skill === "kappa")).toBeUndefined();
  });

  it("errors are sorted before warnings", () => {
    const f = lint(root);
    const firstWarn = f.findIndex((x) => x.severity === "warn");
    const lastError = f.map((x) => x.severity).lastIndexOf("error");
    if (firstWarn >= 0 && lastError >= 0) expect(lastError).toBeLessThan(firstWarn);
  });
});

describe("fenced blocks are examples, not references", () => {
  it("ignores a path inside a fenced block", () => {
    skill("lambda", 'name: lambda\ndescription: A description long enough to pass the length check here.',
      "Output looks like:\n\n```markdown\n- `path/covered.py` — pinned by a test\n```\n");
    expect(lint(root).find((x) => x.rule === "broken-reference" && x.skill === "lambda")).toBeUndefined();
  });
  it("still flags a real reference outside a fence", () => {
    skill("mu", 'name: mu\ndescription: A description long enough to pass the length check here.',
      "```\n- `fenced/example.py`\n```\n\nSee [notes](references/gone.md).");
    const f = lint(root).find((x) => x.rule === "broken-reference" && x.skill === "mu");
    expect(f?.message).toContain("references/gone.md");
  });
});

describe("only checkable paths are checked", () => {
  it("ignores globs and templated placeholders", () => {
    skill("nu", 'name: nu\ndescription: A description long enough to pass the length check here.',
      "See `tests/*.spec.ts` and `{lang}/api/README.md` and `specs/<flow>.md`.");
    expect(lint(root).find((x) => x.rule === "broken-reference" && x.skill === "nu")).toBeUndefined();
  });
  it("downgrades a path outside the skill directory to a warning", () => {
    skill("xi", 'name: xi\ndescription: A description long enough to pass the length check here.',
      "Configured in [settings](~/.config/thing.json).");
    const f = lint(root).find((x) => x.skill === "xi" && x.rule === "unportable-reference");
    expect(f?.severity).toBe("warn");
  });
});

describe("waivers", () => {
  it("suppresses a rule a skill waived for itself", () => {
    skill("omicron", "name: omicron\ndescription: Short.", "<!-- skill-lint disable thin-description -->");
    expect(lint(root).find((x) => x.skill === "omicron" && x.rule === "thin-description")).toBeUndefined();
  });
  it("does not suppress a rule the skill did not waive", () => {
    skill("pi", "name: not-pi\ndescription: Short.", "<!-- skill-lint disable thin-description -->");
    expect(lint(root).find((x) => x.skill === "not-pi" && x.rule === "name-mismatch")).toBeDefined();
  });
  it("waives a collision only when every owner waived it", () => {
    skill("rho", 'name: rho\ndescription: A long enough description that triggers on "shared trigger here".',
      "<!-- skill-lint disable trigger-collision -->");
    skill("sigma", 'name: sigma\ndescription: A long enough description that triggers on "shared trigger here".');
    expect(lint(root).find((x) => x.rule === "trigger-collision" && x.skill.includes("rho"))).toBeDefined();
  });
});
