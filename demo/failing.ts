/**
 * A set that fails, so the page opens on something to read.
 *
 * Written here rather than added to examples/, for two reasons. examples/ holds skills the
 * repository stands behind and its own CI lints - putting a deliberately broken one there
 * would turn the self-lint red and mean nothing. And this set is not a copy of anything, so
 * there is no second version of it to drift.
 *
 * Every flaw is one a real skill set has: the same trigger claimed twice, a description with
 * nothing in it to route on, and a reference pointing outside the skill's own directory.
 */
export const FAILING: readonly string[] = [
  `---
name: pr-review-followup
description: Work through review comments on a pull request and answer each one. Use when a PR comes back with requested changes, when a reviewer has left comments, or when a review needs a reply. Triggers on "requested changes", "the PR came back", "address the review".
---

# PR review follow-up

Read every thread before answering any of them. See \`../shared/review-rubric.md\` for the
rubric.
`,
  `---
name: code-quality
description: Check code before it goes out. Triggers on "requested changes", "is this ready".
---

# Code quality

Run the checks.
`,
];
