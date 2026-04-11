## Why

Introduce `{ stage: 'init', args }` state initialization, add `env.persistState` and `env.deps`, inline `ensurePendingDispatchWork` into staged `runTeam` orchestration, and thread metadata-generation, planning, coding, reviewing, and archiving through the same resumable state model. Refactor team orchestration around a persisted `runTeam` stage machine and inline dispatch scheduling. This proposal is one candidate implementation for the request: improve state design: - inline `ensurePendingDispatchWork` into `runTeam` function. - For `runTeam` function, split it into five parts: `metadata-generation`, `planning`, `coding`, `reviewing`, `archiving`. - first, initialize state as `{ stage: 'init', args }`, this is always initial state of every stateful function. - the state is first persisted in the storage, and then respond to user, and then then triggers stateful `runTeam` function. - A stateful function will look like `runTeam = async (env, state) => { switch(state.stage) { case 'init': doSomething; ...; break; } env.persistState(state); }` - `env` contains `persistState` and dependencies `env.deps: Deps`. - the `persistState` is left nop and we will implement it in future to reduce effort of refactoring.

## What Changes

- Introduce the `stateful-team-run-a1-p1-refactor-runteam-into-a-persisted-stage-machine` OpenSpec change for proposal "Refactor `runTeam` into a persisted stage machine".
- Introduce `{ stage: 'init', args }` state initialization, add `env.persistState` and `env.deps`, inline `ensurePendingDispatchWork` into staged `runTeam` orchestration, and thread metadata-generation, planning, coding, reviewing, and archiving through the same resumable state model.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `stateful-team-run-a1-p1-refactor-runteam-into-a-persisted-stage-machine`: Introduce `{ stage: 'init', args }` state initialization, add `env.persistState` and `env.deps`, inline `ensurePendingDispatchWork` into staged `runTeam` orchestration, and thread metadata-generation, planning, coding, reviewing, and archiving through the same resumable state model.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `refactor(team/runteam): Refactor `runTeam` into a persisted stage machine`
- Conventional title metadata: `refactor(team/runteam)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: OpenSpec-aligned proposal: `stateful-team-run` Objective: - Replace the current one-shot planner-oriented `runTeam` flow with a staged state machine that starts from `{ stage: "init", args }`, persists state through `env.persistState`, and owns orchestration across metadata generation, planning, coding, reviewing, and archiving. Implementation shape: 1. Define explicit run args, state, stage, and env contracts so `runTeam(env, state)` can resume from persisted state and rely on `env.deps` plus `env.persistState`. 2. Refactor the current planner path in `lib/team/network.ts` into stage handlers for `metadata-generation` and `planning`, preserving current request-title and planner-agent behavior. 3. Fold `ensurePendingDispatchWork` responsibilities into `runTeam`-owned stage transitions, reusing the existing dispatch allocator and lane execution code instead of duplicating scheduler logic. 4. Route coding, reviewing, and archiving advancement through the same staged orchestration model so approval or feedback entrypoints advance persisted state rather than bypassing it. 5. Update the run, feedback, and approval routes, plus any affected UI or API docs, if the accepted-before-execute flow changes. 6. Add focused regression coverage for stage initialization, persistence calls, dispatch creation, downstream stage progression, and failure paths; validate with `pnpm lint` and `pnpm build`. Scope boundaries: - Keep current prompts and role outputs stable. - Keep `persistState` as a no-op seam for now. - Minimize thread-store schema churn; only add compatibility fields required for staged orchestration. Risks: - The existing streamed planner UX may need adjustment if execution starts only after a persisted initial state is written. - Archiving already exists in approval flow; the refactor should wrap that behavior into a stage boundary rather than re-implementing archive semantics. Approval note: This is one coherent proposal. The coding-review pool should stay idle until human approval arrives.
