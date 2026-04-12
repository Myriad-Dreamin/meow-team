---
title: Team
outline: deep
---

# Team

This roadmap tracks the harness-team runtime surface: orchestration in
`lib/team`, prompt and role boundaries, and the persistence or execution
contracts that keep multi-lane runs deterministic.

## Design Notes

- Keep `lib/team/network.ts` as the execution coordinator while topic files
  capture the longer-running responsibilities behind each subsystem.
- Use the Network topic for dispatch, stage transitions, and archive-time
  control flow.
- Keep role behavior consolidated in the statically imported prompt templates
  and modules under `lib/team/roles`.
- Use the Roles topic for prompt rendering, schema contracts, and role-specific
  execution boundaries.
- Use the Storage topic for persisted run state, history, and thread data.
- Use the Worktree topic for reusable checkout behavior, git or `gh`
  subprocess hygiene, and tracking-PR delivery rules that depend on managed
  lane worktrees.
- Favor typed template imports and explicit state shaping over ad-hoc string
  assembly.
- Keep role additions predictable so new harness roles can be added without
  hidden prompt coupling.

## Topics

- [Network](/roadmap/team/network)
- [Roles](/roadmap/team/roles)
- [Storage](/roadmap/team/storage)
- [Worktree](/roadmap/team/worktree)
