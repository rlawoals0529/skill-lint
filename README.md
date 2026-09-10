# skill-lint

Lint agent `SKILL.md` files for the things that break a skill without anyone noticing.

A skill fails quietly. It points at a reference file that was never copied, or claims a
trigger phrase another skill already owns, or carries a description too vague for a model
to route on. Nothing errors. It just does not fire, or the wrong one fires, and you find
out weeks later.

```bash
npx skill-lint .
```

```
error  broken-reference
  audit-pr-threads
    Points at `workflows/thread-audit.js`, which does not exist. A skill that
    references a missing file fails only when someone runs it.

warn   trigger-collision
  code-quality, review-triage
    Trigger "requested changes" is claimed by 2 skills. Which one fires is a coin flip.

52 skills checked  ·  43 errors  ·  50 warnings
```

That last line is real: a run across 52 installed skills, a mix of hand-written and
published ones.

## Rules

| Rule | Severity | Catches |
| --- | --- | --- |
| `missing-name` | error | Frontmatter has no `name`, so the harness cannot register it |
| `name-mismatch` | error | Frontmatter name differs from the directory name |
| `missing-description` | error | Nothing tells the model when to use the skill |
| `broken-reference` | error | Points at a file that is not there |
| `unportable-reference` | warn | Points outside the skill directory, so it dies on install elsewhere |
| `trigger-collision` | warn | Two skills claim the same quoted trigger phrase |
| `unknown-skill-reference` | warn | Invokes a `/skill` that is not in the tree |
| `thin-description` | warn | Too short to route on |
| `bloated-description` | warn | A second copy of the body, paid for on every turn |
| `no-triggers` | warn | No quoted phrases, so routing falls back to a paraphrase match |
| `context-bloat` | warn | Long enough that it should be split into `references/` |

Errors exit 1. Warnings do not.

## Not reported, on purpose

The hard part is not finding candidates, it is not burying the real ones. These look like
paths and are skipped:

- **Globs** — `tests/*.spec.ts`
- **Templated placeholders** — `{lang}/api/README.md`, `specs/<flow>.md`
- **Anything containing whitespace**, which is a command rather than a path
- **Fenced code blocks entirely**, because an example output listing is not a reference

The first run of this tool reported a path from inside a fenced block showing example
output. A linter that cries wolf gets muted, so those four exclusions are covered by tests.

## Examples

Two reference skills live in [`examples/`](examples), and CI lints them on every push — so
the tool is exercised against real files rather than only its own fixtures.

## Waiving a rule

A linter with no escape hatch gets switched off wholesale the first time it is confidently
wrong. Waive one rule for one skill from inside the skill:

```markdown
<!-- skill-lint disable trigger-collision -->
```

Waivers are per rule and per skill, never global. A collision names every owner, so it is
suppressed only when **every** one of them has waived it — one skill cannot silence a
conflict on another's behalf.

## Options

```
skill-lint [dir] [options]

  --max-lines N        flag a skill longer than N lines (default 500)
  --min-description N  flag a description shorter than N chars (default 40)
  --max-description N  flag a description longer than N chars (default 1024)
  --warn-only          always exit 0
```

## Use it as a library

```ts
import { lint } from "skill-lint";

for (const f of lint("./skills")) {
  console.log(f.severity, f.rule, f.skill, f.message);
}
```

## CI

```yaml
- run: npx skill-lint .
```

MIT
