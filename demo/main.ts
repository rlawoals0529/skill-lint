/**
 * The linter, in a browser.
 *
 * Design read: a lint report, printed the way the CLI prints one. Severity in the left
 * margin, the rule as the key, the skills under it, and a line at the bottom that counts.
 * A dashboard would be a different tool; this is the output of a run.
 *
 * `core.ts` is deliberately free of `node:fs`, which is the only reason this page can exist.
 * The one rule that needs a filesystem is `broken-reference`, and `lintSkills()` takes that
 * check as an injected option: leave it out and the rule is SKIPPED rather than guessed at.
 * The page says so above the report, because a clean report that quietly skipped a rule
 * reads as a pass.
 */
import { lintSkills, parseSkill, type Finding, type Skill } from "../dist/core.js";
import { createThemeStore, grouped, type Theme } from "./lib/theme.js";
import { wirePalette } from "./lib/palette-keys.js";
import { EXAMPLES } from "./examples.js";
import { FAILING } from "./failing.js";

const editors = document.getElementById("editors")!;
const report = document.getElementById("report")!;
const summary = document.getElementById("summary")!;
const count = document.getElementById("count")!;

/** One pane per skill, because collisions are between skills and one textarea has no pairs. */
function addEditor(source: string): void {
  const wrap = document.createElement("div");
  wrap.className = "editor";

  const label = document.createElement("label");
  label.className = "editor-label";
  const n = editors.children.length + 1;
  label.textContent = `SKILL.md ${n}`;

  const area = document.createElement("textarea");
  area.spellcheck = false;
  area.rows = 10;
  area.value = source;
  area.setAttribute("aria-label", `SKILL.md ${n}`);

  const drop = document.createElement("button");
  drop.type = "button";
  drop.className = "editor-drop";
  drop.textContent = "Remove";
  drop.addEventListener("click", () => {
    wrap.remove();
    renumber();
    lint();
  });

  label.append(drop);
  wrap.append(label, area);
  editors.append(wrap);
  area.addEventListener("input", lint);
}

/** The panes are numbered, and a removal in the middle must not leave a gap. */
function renumber(): void {
  [...editors.children].forEach((el, i) => {
    const label = el.querySelector(".editor-label")!;
    const area = el.querySelector("textarea")!;
    label.childNodes[0]!.textContent = `SKILL.md ${i + 1}`;
    area.setAttribute("aria-label", `SKILL.md ${i + 1}`);
  });
  count.textContent = `${editors.children.length} skill${editors.children.length === 1 ? "" : "s"} in this set.`;
}

function load(sources: readonly string[]): void {
  editors.replaceChildren();
  for (const s of sources) addEditor(s);
  renumber();
  lint();
}

/**
 * Parse every pane into a Skill.
 *
 * `dir` is what a collision report names a skill by when its frontmatter has no `name`, and
 * in a browser there is no directory - so the pane's own number stands in. Calling it
 * something is what keeps a finding readable; calling it nothing would print a bare comma.
 */
function skills(): Skill[] {
  return [...editors.querySelectorAll("textarea")]
    .map((area, i) => ({ text: area.value, i }))
    .filter(({ text }) => text.trim() !== "")
    .map(({ text, i }) => parseSkill(text, { dir: `skill-${i + 1}`, file: `skill-${i + 1}/SKILL.md` }));
}

const BY_SEVERITY = { error: 0, warn: 1 } as const;

/**
 * Rules that need something a pasted file does not have, and are dropped rather than faked.
 *
 * `broken-reference` needs a filesystem, and `lintSkills()` skips it on its own when the
 * existence check is not injected. `name-mismatch` needs a DIRECTORY to compare the
 * frontmatter name against, and pasted text has none - the pane numbers here are a label,
 * not a path. Handing it a directory equal to the name would make the rule pass every time,
 * which is not the rule passing, it is the rule being lied to.
 */
const CANNOT_RUN_HERE = new Set(["broken-reference", "name-mismatch"]);

function lint(): void {
  const set = skills();
  // refExists is deliberately NOT passed. See the note above the report.
  const findings = lintSkills(set)
    .filter((f) => !CANNOT_RUN_HERE.has(f.rule))
    .sort(
      (a, b) => BY_SEVERITY[a.severity] - BY_SEVERITY[b.severity] || a.rule.localeCompare(b.rule),
    );

  report.replaceChildren(...lines(findings));
  const errors = findings.filter((f) => f.severity === "error").length;
  const warns = findings.length - errors;
  summary.textContent =
    `${set.length} skill${set.length === 1 ? "" : "s"} checked · ` +
    `${errors} error${errors === 1 ? "" : "s"} · ${warns} warning${warns === 1 ? "" : "s"}`;
}

/** The report, as the CLI lays it out: severity, rule, the skills it names, the reason. */
function lines(findings: readonly Finding[]): Node[] {
  if (findings.length === 0) {
    const p = document.createElement("span");
    p.className = "clean";
    p.textContent = "Nothing to report. Every rule that can run here found nothing.";
    return [p];
  }

  return findings.flatMap((f) => {
    const block = document.createElement("div");
    block.className = "finding";
    block.dataset.severity = f.severity;
    block.dataset.rule = f.rule;

    const head = document.createElement("div");
    head.className = "finding-head";
    const sev = document.createElement("b");
    sev.className = "sev";
    sev.textContent = f.severity;
    const rule = document.createElement("span");
    rule.className = "rule";
    rule.textContent = f.rule;
    head.append(sev, rule);

    const who = document.createElement("div");
    who.className = "who";
    who.textContent = f.skill;

    const why = document.createElement("div");
    why.className = "why";
    why.textContent = f.message;

    block.append(head, who, why);
    return [block];
  });
}

document.getElementById("add")!.addEventListener("click", () => {
  addEditor("");
  renumber();
  lint();
});
document.getElementById("examples")!.addEventListener("click", () => load(EXAMPLES));
document.getElementById("failing")!.addEventListener("click", () => load(FAILING));
document.getElementById("lint")!.addEventListener("click", lint);

/*
 * The page opens on a set that FAILS, because an empty box teaches nothing and so does a
 * clean report: the first thing a visitor meets should be the tool doing its job. The two
 * real examples are one button away, and switching to them is the demonstration that the
 * report goes quiet when there is nothing wrong.
 */
load(FAILING);

/* ---- palette ---------------------------------------------------------------------------- */

const THEMES = (await fetch("./theme/palettes.json").then((r) => r.json())) as Theme[];
const store = createThemeStore(THEMES, "twilight-comet", "skill-lint:theme");
let chosen = store.initial();

const host = document.getElementById("palette-host")!;
host.innerHTML = `
  <section class="palette">
    <button class="palette-toggle" type="button" aria-expanded="false" aria-controls="palette-list">
      <span class="palette-chip" aria-hidden="true" id="chip"></span>
      <span class="sr-only">Palette: </span><span id="palette-name"></span>
    </button>
    <div class="palette-list" id="palette-list" hidden></div>
  </section>`;

const list = document.getElementById("palette-list")!;
const toggle = document.querySelector<HTMLButtonElement>(".palette-toggle")!;
const chip = document.getElementById("chip")!;
const nameOut = document.getElementById("palette-name")!;
const options: HTMLElement[] = [];

for (const group of grouped(THEMES)) {
  const set = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = group.label;
  set.append(legend);
  for (const t of group.themes) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.theme = t.id;
    // data-theme goes on the CHIP as well: on the button alone it also rescopes --fg and
    // --dim, so the option's own label gets painted in a palette the page is not showing.
    const swatch = document.createElement("span");
    swatch.className = "palette-chip";
    swatch.setAttribute("aria-hidden", "true");
    swatch.dataset.theme = t.id;
    b.append(swatch, t.label);
    options.push(b);
    set.append(b);
  }
  list.append(set);
}

function select(id: string): void {
  chosen = store.apply(id);
  const t = THEMES.find((x) => x.id === chosen);
  nameOut.textContent = t?.label ?? "Palette";
  chip.dataset.theme = chosen;
}

function setOpen(open: boolean): void {
  toggle.setAttribute("aria-expanded", String(open));
  list.hidden = !open;
  if (!open) toggle.focus();
}

const picker = wirePalette(list, options, { select, current: () => chosen, onEscape: () => setOpen(false) });
toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
select(chosen);
picker.refresh();
