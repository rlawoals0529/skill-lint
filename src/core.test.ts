import { describe, expect, it } from "vitest";
import { parseSkill, lintSkills, baseName, frontmatter, triggersOf } from "./core.js";

const skill = (name: string, description: string, body = "") =>
  parseSkill(`---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`, { dir: `skills/${name}` });

describe("the core runs with no filesystem", () => {
  it("parses a skill from a string alone", () => {
    const s = skill("alpha", "Does a thing. Use when you want \"the thing done\" today.");
    expect(s.name).toBe("alpha");
    expect(s.description).toContain("Does a thing");
    expect(s.lines).toBeGreaterThan(0);
  });

  it("lints skills that were never on disk", () => {
    const findings = lintSkills([
      skill("alpha", 'A description long enough to pass the length check, triggers on "shared".'),
      skill("beta", 'Another description long enough to pass, also triggers on "shared".'),
    ]);
    expect(findings.find((f) => f.rule === "trigger-collision")?.message).toContain("shared");
  });

  it("skips broken-reference when it has no way to check", () => {
    // A linter that cannot check something must say nothing about it, rather than assume
    // the happy answer. In a browser there is no filesystem to ask.
    const s = skill("gamma", "A description long enough to pass the length check here.",
      "See [notes](references/missing.md).");
    expect(lintSkills([s]).find((f) => f.rule === "broken-reference")).toBeUndefined();
  });

  it("reports broken-reference when given a way to check", () => {
    const s = skill("delta", "A description long enough to pass the length check here.",
      "See [notes](references/missing.md).");
    const findings = lintSkills([s], { refExists: () => false });
    expect(findings.find((f) => f.rule === "broken-reference")?.severity).toBe("error");
  });
});

describe("baseName replaces node:path", () => {
  it("takes the last segment", () => {
    expect(baseName("a/b/c")).toBe("c");
  });
  it("handles a windows separator", () => {
    expect(baseName("a\\b\\c")).toBe("c");
  });
  it("ignores a trailing separator", () => {
    expect(baseName("a/b/c/")).toBe("c");
  });
  it("returns the input when there is no separator", () => {
    expect(baseName("solo")).toBe("solo");
  });
});

describe("frontmatter", () => {
  it("reads a folded block", () => {
    const fm = frontmatter("---\nname: x\ndescription: >-\n  one two\n  three\n---\n");
    expect(fm.description).toBe("one two three");
  });
  it("strips surrounding quotes", () => {
    expect(frontmatter('---\nname: "quoted"\n---\n').name).toBe("quoted");
  });
  it("returns nothing when there is no frontmatter", () => {
    expect(frontmatter("# Just a heading")).toEqual({});
  });
});

describe("triggersOf handles smart quotes", () => {
  it("reads curly quotes as well as straight ones", () => {
    expect(triggersOf('Triggers on “fancy quotes” and "plain ones".')).toEqual([
      "fancy quotes",
      "plain ones",
    ]);
  });
});
