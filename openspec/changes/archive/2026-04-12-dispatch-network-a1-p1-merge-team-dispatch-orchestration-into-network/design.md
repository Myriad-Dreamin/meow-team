## Context

This change captures proposal "Merge team dispatch orchestration into network" as OpenSpec change `dispatch-network-a1-p1-merge-team-dispatch-orchestration-into-network`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Consolidate `lib/team/dispatch.ts` into `lib/team/network.ts`, move route and internal callers to the unified module, preserve current planning/approval/replan behavior, and merge all dispatch regression suites into `lib/team/network.test.ts` before deleting the standalone dispatch module and tests.
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
- Keep the canonical request/PR title as `refactor(team/network): Merge team dispatch orchestration into network`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `refactor(team/network)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `refactor(team/network): Merge team dispatch orchestration into network`
- Conventional title metadata: `refactor(team/network)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal: `Merge team dispatch orchestration into network` Suggested OpenSpec seed: `merge-dispatch-network` Objective: simplify team orchestration ownership by making `lib/team/network.ts` the single module for staged run control and dispatch operations, then merge all dispatch-focused regression coverage into `lib/team/network.test.ts`. Why this is one proposal: - `network.ts` already owns the persisted run-state machine, so the remaining `dispatch.ts` split mostly adds indirection. - The test merge only makes sense once the public/module boundary is unified. - Routes and internal callers should move in the same change to avoid temporary duplication. Implementation shape: 1. Move the current dispatch surface from `lib/team/dispatch.ts` into `lib/team/network.ts`, including `DispatchThreadCapacityError`, planner assignment materialization, slot allocators, queue/approve flows, pull-request finalization, dispatch queue scheduling, and feedback replanning. 2. Update route and module callers so the API layer and any internal imports depend on `network.ts` as the single entry module, while keeping current behavior and payloads unchanged. 3. Remove the now-redundant cross-module delegation inside `network.ts` so stage handlers call local helpers instead of importing `dispatch.ts`. 4. Consolidate `lib/team/dispatch.test.ts`, `lib/team/dispatch-stale-slot.test.ts`, `lib/team/dispatch-branch-prefix.test.ts`, and `lib/team/dispatch-approval.test.ts` into `lib/team/network.test.ts`, preserving focused `describe` coverage for allocator behavior, planner materialization, stale allocator protection, approval/archive flow, and full `runTeam` orchestration. 5. Delete `lib/team/dispatch.ts` and the standalone dispatch test files once the unified module and merged tests are passing. 6. Validate with `pnpm fmt`, `pnpm lint`, relevant Vitest coverage, and `pnpm build` because exported module boundaries and API wiring change. Scope boundaries: - Do not intentionally change planner outputs, lane scheduling rules, thread-store schema, or API contracts. - Do not broaden this into a larger architectural rewrite unless a minimal helper/type extraction is required to keep the merged module coherent. Risks and assumptions: - Preserve the server-only safety of dispatch operations after the merge. - Keep the follow-up refactor aligned with the existing staged `runTeam` design instead of re-planning the workflow. - Test consolidation must retain readable failure isolation even though the requested final home is a single `network.test.ts` file. Approval note: this is one coherent refactor proposal. The coding-review pool should remain idle until human approval arrives.
