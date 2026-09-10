---
name: changelog-entry
description: Write a changelog entry from a merged diff, in the voice of someone telling a user what changed for them rather than what moved in the code. Use after merging a pull request, when preparing a release, or when a changelog line reads like a commit message. Triggers on "write the changelog", "changelog entry", "what shipped", "release notes".
---

# Changelog entry

A changelog is read by someone deciding whether to upgrade. It is not a commit log.

## Rules

1. **Lead with what the reader can now do**, or what stopped happening to them. Not the
   file that changed.
2. **One entry per user-visible change.** Three commits that together fix one bug are one
   entry.
3. **Name the surface.** "Fixed a crash" is unactionable; "Fixed a crash when importing a
   CSV with no header row" tells a reader whether it affects them.
4. **No entry for internal work** unless it changes behaviour, performance or an interface.
   A refactor with identical behaviour is invisible by design.

## Shape

```
### Fixed
- Importing a CSV with no header row no longer crashes the preview.
```

Group under Added, Changed, Fixed, Removed. Drop any group that is empty rather than
printing it with nothing under it.
