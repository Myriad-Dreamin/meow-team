---
name: team-harness-workflow
description: Use when Codex CLI is acting as the planner, coder, or reviewer inside a Meow-style engineering harness. Covers proposal planning, dedicated lane worktree rules, validation expectations, and local skill usage.
---

Use this skill whenever Codex is running one step of the harness workflow in the
current project.

Read the project-provided role prompt first, then use the inline source
references that match the role:

- Planner work: read [`references/planner.md`](references/planner.md)
- Coder or reviewer lane work: read [`references/lanes.md`](references/lanes.md)

Shared expectations:

- Use project-local skills from `.codex/skills` when they fit, especially
  OpenSpec skills when the project has them.
- Use `pnpm` for validation and package commands.
- Reviewer suggestions must include either a failing PoC test artifact or a
  reviewer todo artifact. See `references/lanes.md` for the detailed
  contract.
- Keep final outputs concrete and structured for the harness to persist.
