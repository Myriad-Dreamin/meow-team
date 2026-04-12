## Context

This change captures proposal "Centralize CLI command runners" as OpenSpec change `cli-tools-a1-p1-centralize-cli-command-runners`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Move the duplicated `git`, `gh`, and `openspec` exec wrappers into `lib/cli-tools` with one shared process runner, update the existing team and git modules to consume it, and preserve current behavior through validation and targeted tests.
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
- Keep the canonical request/PR title as `refactor: Centralize CLI command runners`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `refactor` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `refactor: Centralize CLI command runners`
- Conventional title metadata: `refactor`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal: `Centralize CLI command runners` Suggested OpenSpec seed: `centralize-cli-command-runners` Objective: Move the duplicated `runGit` implementations in `lib/git/ops.ts` and `lib/team/git.ts`, plus `runGh` in `lib/git/ops.ts` and `runOpenSpec` in `lib/team/openspec.ts`, into `lib/cli-tools` backed by one shared process-execution utility. Implementation shape: 1. Add `lib/cli-tools` with a shared runner for CLI process execution. 2. Create thin `git`, `gh`, and `openspec` adapters that preserve current command semantics. 3. Rewire existing callers to use the shared adapters without changing higher-level workflow behavior. 4. Cover the refactor with targeted tests for runner behavior and caller expectations. 5. Validate with `pnpm fmt`, `pnpm lint`, targeted tests, and `pnpm build` when shared module boundaries change. Scope boundaries and risks: - Keep the refactor behavior-preserving for current git/team/openspec flows. - Avoid expanding into unrelated CLI abstractions. - Watch for regressions in cwd handling, env injection, and fallback error messages. - Coding-review lanes stay idle until human approval arrives.
