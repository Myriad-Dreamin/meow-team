## Context

This change captures proposal "Move worktree into TeamRunEnv" as OpenSpec change `worktree-env-a1-p1-move-worktree-into-teamrunenv`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Extract worktree-specific logic from `lib/team/coding/dispatch.ts` into dedicated `lib/team/coding/*` helpers, introduce a narrow shared `Worktree` abstraction, and rewire planner/request-title/coder/reviewer execution so `TeamRunEnv` constructs and passes that worktree context instead of raw `worktreePath` strings while preserving existing dispatch behavior and regression coverage.
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
- Keep the canonical request/PR title as `refactor(team/coding): Move worktree into TeamRunEnv`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `refactor(team/coding)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `refactor(team/coding): Move worktree into TeamRunEnv`
- Conventional title metadata: `refactor(team/coding)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Recommended proposal set: 1 proposal. Proposal: `Move worktree into TeamRunEnv` Suggested OpenSpec seed: `move-worktree-into-teamrunenv` Why this stays one proposal: - The request is a single boundary refactor across the same execution path: planning metadata, dispatch lane execution, and role-agent invocation all currently pass raw worktree paths or compute them inline. - Splitting extraction from env plumbing would force an interim duplicate API where some stages use `Worktree` and others still use strings, which raises migration risk without producing an independently reviewable slice. Objective: - Extract the worktree-specific coordination now embedded in `lib/team/coding/dispatch.ts` into focused `lib/team/coding/*` module(s), then make `TeamRunEnv` the shared source that constructs and carries a `Worktree` object into planner, request-title, coder, and reviewer agent runs. Implementation shape: 1. Define a narrow `Worktree` abstraction under `lib/team/coding/` that captures the checkout path plus the minimum metadata agents and executors need; keep it small instead of turning every git operation into instance methods. 2. Move dispatch-local worktree helpers and state assembly out of `lib/team/coding/dispatch.ts` into dedicated worktree-focused helpers so dispatch orchestration stops owning path construction and inline fallback logic. 3. Extend `TeamRunEnv`, stage helpers, and shared run-state builders so planning and lane execution construct a `Worktree` once and pass that object onward rather than threading bare `worktreePath` strings through `plan.ts`, `dispatch.ts`, and the role modules. 4. Update the agent and executor surfaces that currently require `worktreePath` to accept the new worktree context while preserving current prompt content and Codex CLI working-directory behavior. 5. Preserve current scheduling and lifecycle behavior: no intended change to thread slot allocation, lane slot reuse, planner proposal materialization, PR synchronization, or archive sequencing beyond the refactor required to use the new abstraction. 6. Expand regression coverage around `createTeamRunEnv`, planning metadata generation, lane execution, and role dependency wiring so tests prove the correct worktree object or path reaches each agent and existing worktree lifecycle behavior stays the same. Scope boundaries: - Do not redesign the planner -> coder -> reviewer workflow. - Do not broaden this into a large git-wrapper rewrite unless a minimal helper move is required to support the new boundary. - Keep persisted thread data stable unless a small compatibility addition is unavoidable. Assumptions and risks: - The minimal useful `Worktree` API is not explicit in the codebase yet; the approved implementation should keep it value-oriented and avoid hiding orchestration decisions inside a stateful class unless the code proves that necessary. - Request-title and planner runs also depend on a worktree path today, so the change must cover planning-stage agent calls, not only coder and reviewer lane execution. - The main regression risk is half-migrated tests or dispatch helpers still reconstructing raw paths after `TeamRunEnv` becomes the source of truth. Validation: - Run `pnpm fmt`, `pnpm lint`, targeted Vitest coverage for `lib/team/coding/index.test.ts`, role dependency or role tests, and any new worktree module tests, plus `pnpm build` because shared orchestration contracts change. Approval note: - Materialize this as one OpenSpec change. The shared coder/reviewer pool should remain idle until human approval arrives.
