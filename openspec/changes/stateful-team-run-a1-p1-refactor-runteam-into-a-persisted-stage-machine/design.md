## Context

This change captures proposal "Refactor `runTeam` into a persisted stage machine" as OpenSpec change `stateful-team-run-a1-p1-refactor-runteam-into-a-persisted-stage-machine`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Introduce `{ stage: 'init', args }` state initialization, add `env.persistState` and `env.deps`, inline `ensurePendingDispatchWork` into staged `runTeam` orchestration, and thread metadata-generation, planning, coding, reviewing, and archiving through the same resumable state model.
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
- Keep the canonical request/PR title as `refactor(team/runteam): Refactor `runTeam` into a persisted stage machine`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `refactor(team/runteam)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `refactor(team/runteam): Refactor `runTeam` into a persisted stage machine`
- Conventional title metadata: `refactor(team/runteam)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: OpenSpec-aligned proposal: `stateful-team-run` Objective: - Replace the current one-shot planner-oriented `runTeam` flow with a staged state machine that starts from `{ stage: "init", args }`, persists state through `env.persistState`, and owns orchestration across metadata generation, planning, coding, reviewing, and archiving. Implementation shape: 1. Define explicit run args, state, stage, and env contracts so `runTeam(env, state)` can resume from persisted state and rely on `env.deps` plus `env.persistState`. 2. Refactor the current planner path in `lib/team/network.ts` into stage handlers for `metadata-generation` and `planning`, preserving current request-title and planner-agent behavior. 3. Fold `ensurePendingDispatchWork` responsibilities into `runTeam`-owned stage transitions, reusing the existing dispatch allocator and lane execution code instead of duplicating scheduler logic. 4. Route coding, reviewing, and archiving advancement through the same staged orchestration model so approval or feedback entrypoints advance persisted state rather than bypassing it. 5. Update the run, feedback, and approval routes, plus any affected UI or API docs, if the accepted-before-execute flow changes. 6. Add focused regression coverage for stage initialization, persistence calls, dispatch creation, downstream stage progression, and failure paths; validate with `pnpm lint` and `pnpm build`. Scope boundaries: - Keep current prompts and role outputs stable. - Keep `persistState` as a no-op seam for now. - Minimize thread-store schema churn; only add compatibility fields required for staged orchestration. Risks: - The existing streamed planner UX may need adjustment if execution starts only after a persisted initial state is written. - Archiving already exists in approval flow; the refactor should wrap that behavior into a stage boundary rather than re-implementing archive semantics. Approval note: This is one coherent proposal. The coding-review pool should stay idle until human approval arrives.
