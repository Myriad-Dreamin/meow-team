---
name: team-harness-workflow
description: Use when Codex CLI is acting as the planner, coder, or reviewer inside this repository's engineering harness. Covers proposal planning, dedicated lane worktree rules, validation expectations, and local skill usage.
---

Use this skill whenever Codex is running one step of the harness workflow in
this repository.

Read the role prompt first, then use the references that match the role:

- Planner work: read [`references/planner.md`](references/planner.md)
- Coder or reviewer lane work: read [`references/lanes.md`](references/lanes.md)

Shared expectations:

- Read `INSTRUCTIONS.md` and `AGENTS.md` before making changes.
- Use repo-local skills from `.codex/skills` when they fit, especially the
  OpenSpec skills.
- Use `pnpm` for validation and package commands.
- Keep final outputs concrete and structured for the harness to persist.
