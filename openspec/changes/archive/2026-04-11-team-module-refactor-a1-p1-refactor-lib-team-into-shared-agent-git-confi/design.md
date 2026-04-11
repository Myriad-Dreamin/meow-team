## Context

This change captures proposal "Refactor lib/team into shared agent, git, config, and status modules" as OpenSpec change `team-module-refactor-a1-p1-refactor-lib-team-into-shared-agent-git-confi`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**

- Convert request-title/planner/coder/reviewer runners into injected agent classes, move reusable agent/git/config/status and repository-context code out of `lib/team`, keep runtime validation only at untyped boundaries, and preserve current harness behavior with updated tests and validation.
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

## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal: `Refactor lib/team shared modules` Suggested OpenSpec seed: `refactor-lib-team-shared-modules` Objective: finish the `lib/team` refactor by converting role runners into injected classes, removing redundant runtime validation at strongly typed call sites, and moving reusable repository/git/config/status/agent code into shared `lib/*` modules. Implementation shape: 1. Replace function-style role runners with class-based agents such as `RequestTitleAgent`, `PlannerAgent`, `CoderAgent`, and `ReviewerAgent`; inject `TeamStructuredExecutor` and any helpers through constructors, and update dependency resolution plus tests to pass agent instances instead of free functions. 2. Keep zod at untyped boundaries only: structured model output, config parsing, environment/JSON/TOML parsing, persisted thread-store reads, and any explicit downcasts from git/GitHub/OpenSpec JSON. Remove `.parse` calls for internal inputs already guaranteed by TypeScript so class methods consume typed state directly. 3. Extract repository-facing types and role input state into `lib/git/repository.ts`, including the shared repository option/context used by role inputs, dispatch, history, and UI payloads. Keep repository discovery behavior stable unless a cleaner shared abstraction emerges during implementation. 4. Split `lib/team/git.ts` so generic git/GitHub operations move to `lib/git/ops.ts`, while harness-specific branch naming, worktree allocation, and dispatch-oriented helpers stay team-scoped unless they become clearly reusable without coupling. 5. Move `lib/team/config.ts` and `lib/team/runtime-config.ts` to `lib/config`, move `lib/team/host-status.ts` to `lib/status/host.ts`, and move `lib/team/agent/*` to `lib/agent/*`; then update imports across routes, components, prompts, tests, and docs, using compatibility re-exports only if they materially reduce review risk. 6. Add or update focused tests around class-based dependency injection, repository context reuse, relocated git helpers, config/runtime parsing, and import-path regressions; run `pnpm fmt`, `pnpm lint`, and `pnpm build` before handoff. Scope boundaries: - Preserve planner/coder/reviewer prompt content and current workflow semantics. - Do not broaden this into behavior changes for dispatch scheduling, PR lifecycle, or UI beyond import-path fallout. - Keep the work as one cohesive refactor so the module moves and class injection land consistently. Assumptions and risks: - `lib/team/repositories.ts` is partly harness-specific because it reads `TeamConfig`; move repository state/types first, and only move discovery logic if the boundary stays clear. - `lib/team/git.ts` currently mixes generic git ops with harness naming conventions, so misclassifying helpers could create circular imports; the coding pass should settle those boundaries before renaming files. - The class migration will require test rewrites because current mocks target role functions rather than injected agent instances. Approval note: This is one coherent proposal and should materialize as a single OpenSpec change. The pooled coder/reviewer lanes should remain idle until a human approval arrives.
