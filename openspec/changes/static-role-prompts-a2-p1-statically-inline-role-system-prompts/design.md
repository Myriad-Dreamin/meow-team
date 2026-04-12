## Context

This change captures proposal "Statically inline role system prompts" as OpenSpec change `static-role-prompts-a2-p1-statically-inline-role-system-prompts`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Reapply the completed static `prompts/roles` registry refactor onto the current base branch, resolve merge conflicts across prompt loading, docs, and tooling, and rerun validation so runtime filesystem reads stay removed and the change is merge-ready.
- Preserve a reviewable OpenSpec contract before coding starts.
- Keep the proposal logical enough that any pooled worker can execute it.
- Reuse a managed worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` for cache-friendly execution.

**Non-Goals:**
- Bind this proposal to a specific branch or worker slot before approval.
- Expand scope beyond the approved proposal without human feedback.
- Merge sibling proposals into a single coding pass without replanning.

## Decisions

- Store the proposal as a dedicated OpenSpec change before coding begins.
- Let the pooled coding-review runtime allocate execution branches and worktrees after approval.
- Use planner output as the starting point for reviewer validation and follow-up tasks.
- Prefer incremental implementation that can be requeued after machine review feedback.
- Keep the canonical request/PR title as `refactor(team/prompts): Statically inline role system prompts`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `refactor(team/prompts)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `refactor(team/prompts): Statically inline role system prompts`
- Conventional title metadata: `refactor(team/prompts)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal: `Statically inline role system prompts` Objective: Reapply the completed `prompts/roles` static-`*.prompt.md` refactor onto the current base branch, resolve merge conflicts, and land the typed role-prompt registry so harness roles no longer read system prompts from the filesystem at runtime. Implementation shape: 1. Reconcile the existing branch with current base-branch changes, especially in `lib/team/prompts.ts`, prompt-loading call sites, `prompts/roles`, and docs that describe the old runtime-loading path. 2. Preserve the approved design direction: role system prompts remain authored under `prompts/roles`, compile into static `*.prompt.md` modules, and flow through a typed registry that still supplies the `RolePrompt` metadata used by planner/coder/reviewer execution. 3. Keep the existing `lib/team/roles/*.prompt.md` runtime templates and lane behavior intact except where conflict resolution requires small compatibility edits. 4. Update README, roadmap docs, and role-authoring guidance so they match the static registry workflow and no longer describe removed filesystem reads or the obsolete split-prompt wording. 5. Rerun `pnpm fmt`, `pnpm lint`, `pnpm test`, `pnpm typecheck`, and `pnpm build` before handing the lane back to review. Scope boundaries: - Do not add new prompt features, new pipes, or a generalized prompt-management system. - Do not broaden this into workflow redesign or unrelated role-module cleanup. - Do not move role prompt ownership out of `prompts/roles`. Assumptions and risks: - Human feedback means the implementation itself is acceptable; the remaining work is merge integration and regression-proofing. - The highest conflict risk is documentation and prompt-file naming because the repository already contains runtime `*.prompt.md` files under `lib/team/roles`. - Typed prompt import and declaration-sync behavior must be rechecked after conflict resolution because prompt tooling changes are easy to break subtly. Approval note: Treat this as one refreshed OpenSpec change. Keep the coding-review pool idle until the updated proposal is approved.
