## Why

Consolidate `lib/team/dispatch.ts` into `lib/team/network.ts`, move route and internal callers to the unified module, preserve current planning/approval/replan behavior, and merge all dispatch regression suites into `lib/team/network.test.ts` before deleting the standalone dispatch module and tests. Unify team orchestration under `lib/team/network.ts`, remove the separate dispatch module, and merge all dispatch coverage into `lib/team/network.test.ts` without changing runtime behavior. This proposal is one candidate implementation for the request: Merge `lib/team/dispatch.ts` and `lib/team/network.ts` to prepare for future improvement: - simplify logic - merge tests into `lib/team/network.test.ts`.

## What Changes

- Introduce the `dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network` OpenSpec change for proposal "Merge team dispatch orchestration into network".
- Consolidate `lib/team/dispatch.ts` into `lib/team/network.ts`, move route and internal callers to the unified module, preserve current planning/approval/replan behavior, and merge all dispatch regression suites into `lib/team/network.test.ts` before deleting the standalone dispatch module and tests.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network`: Consolidate `lib/team/dispatch.ts` into `lib/team/network.ts`, move route and internal callers to the unified module, preserve current planning/approval/replan behavior, and merge all dispatch regression suites into `lib/team/network.test.ts` before deleting the standalone dispatch module and tests.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `refactor(team/network): Merge team dispatch orchestration into network`
- Conventional title metadata: `refactor(team/network)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Merge team dispatch orchestration into network` Suggested OpenSpec seed: `merge-dispatch-network` Objective: simplify team orchestration ownership by making `lib/team/network.ts` the single module for staged run control and dispatch operations, then merge all dispatch-focused regression coverage into `lib/team/network.test.ts`. Why this is one proposal: - `network.ts` already owns the persisted run-state machine, so the remaining `dispatch.ts` split mostly adds indirection. - The test merge only makes sense once the public/module boundary is unified. - Routes and internal callers should move in the same change to avoid temporary duplication. Implementation shape: 1. Move the current dispatch surface from `lib/team/dispatch.ts` into `lib/team/network.ts`, including `DispatchThreadCapacityError`, planner assignment materialization, slot allocators, queue/approve flows, pull-request finalization, dispatch queue scheduling, and feedback replanning. 2. Update route and module callers so the API layer and any internal imports depend on `network.ts` as the single entry module, while keeping current behavior and payloads unchanged. 3. Remove the now-redundant cross-module delegation inside `network.ts` so stage handlers call local helpers instead of importing `dispatch.ts`. 4. Consolidate `lib/team/dispatch.test.ts`, `lib/team/dispatch-stale-slot.test.ts`, `lib/team/dispatch-branch-prefix.test.ts`, and `lib/team/dispatch-approval.test.ts` into `lib/team/network.test.ts`, preserving focused `describe` coverage for allocator behavior, planner materialization, stale allocator protection, approval/archive flow, and full `runTeam` orchestration. 5. Delete `lib/team/dispatch.ts` and the standalone dispatch test files once the unified module and merged tests are passing. 6. Validate with `pnpm fmt`, `pnpm lint`, relevant Vitest coverage, and `pnpm build` because exported module boundaries and API wiring change. Scope boundaries: - Do not intentionally change planner outputs, lane scheduling rules, thread-store schema, or API contracts. - Do not broaden this into a larger architectural rewrite unless a minimal helper/type extraction is required to keep the merged module coherent. Risks and assumptions: - Preserve the server-only safety of dispatch operations after the merge. - Keep the follow-up refactor aligned with the existing staged `runTeam` design instead of re-planning the workflow. - Test consolidation must retain readable failure isolation even though the requested final home is a single `network.test.ts` file. Approval note: this is one coherent refactor proposal. The coding-review pool should remain idle until human approval arrives.
