## Why

Reapply the completed static `prompts/roles` registry refactor onto the current base branch, resolve merge conflicts across prompt loading, docs, and tooling, and rerun validation so runtime filesystem reads stay removed and the change is merge-ready. Resolve merge conflicts on the approved static role-system prompt inlining change, keep the typed static registry approach, and revalidate code, docs, and prompt tooling before merge. This proposal is one candidate implementation for the request: Current there are role prompts in both `prompts/roles` and `lib/team/roles`. prompts in `prompts/roles` are loaded from fs at runtime. We should inline these prompts statically into `*.prompt.md` to optmize logic.

## What Changes

- Introduce the `static-role-prompts-a2-p1-statically-inline-role-system-prompts` OpenSpec change for proposal "Statically inline role system prompts".
- Reapply the completed static `prompts/roles` registry refactor onto the current base branch, resolve merge conflicts across prompt loading, docs, and tooling, and rerun validation so runtime filesystem reads stay removed and the change is merge-ready.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `static-role-prompts-a2-p1-statically-inline-role-system-prompts`: Reapply the completed static `prompts/roles` registry refactor onto the current base branch, resolve merge conflicts across prompt loading, docs, and tooling, and rerun validation so runtime filesystem reads stay removed and the change is merge-ready.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `refactor(team/prompts): Statically inline role system prompts`
- Conventional title metadata: `refactor(team/prompts)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Statically inline role system prompts` Objective: Reapply the completed `prompts/roles` static-`*.prompt.md` refactor onto the current base branch, resolve merge conflicts, and land the typed role-prompt registry so harness roles no longer read system prompts from the filesystem at runtime. Implementation shape: 1. Reconcile the existing branch with current base-branch changes, especially in `lib/team/prompts.ts`, prompt-loading call sites, `prompts/roles`, and docs that describe the old runtime-loading path. 2. Preserve the approved design direction: role system prompts remain authored under `prompts/roles`, compile into static `*.prompt.md` modules, and flow through a typed registry that still supplies the `RolePrompt` metadata used by planner/coder/reviewer execution. 3. Keep the existing `lib/team/roles/*.prompt.md` runtime templates and lane behavior intact except where conflict resolution requires small compatibility edits. 4. Update README, roadmap docs, and role-authoring guidance so they match the static registry workflow and no longer describe removed filesystem reads or the obsolete split-prompt wording. 5. Rerun `pnpm fmt`, `pnpm lint`, `pnpm test`, `pnpm typecheck`, and `pnpm build` before handing the lane back to review. Scope boundaries: - Do not add new prompt features, new pipes, or a generalized prompt-management system. - Do not broaden this into workflow redesign or unrelated role-module cleanup. - Do not move role prompt ownership out of `prompts/roles`. Assumptions and risks: - Human feedback means the implementation itself is acceptable; the remaining work is merge integration and regression-proofing. - The highest conflict risk is documentation and prompt-file naming because the repository already contains runtime `*.prompt.md` files under `lib/team/roles`. - Typed prompt import and declaration-sync behavior must be rechecked after conflict resolution because prompt tooling changes are easy to break subtly. Approval note: Treat this as one refreshed OpenSpec change. Keep the coding-review pool idle until the updated proposal is approved.
