## Context

This change captures proposal "Add queued Codex executor" as OpenSpec change `queued-codex-exec-a1-p1-add-queued-codex-executor`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Implement a shared queued `TeamStructuredExecutor` for the default Codex executor, cap concurrent executions at `teamConfig.dispatch.workerCount`, keep all other concurrency controls unchanged, and cover the wiring with focused tests.
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
- Keep the canonical request/PR title as `feat: Add queued Codex executor`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `feat` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `feat: Add queued Codex executor`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: OpenSpec-ready proposal: `add-queued-codex-executor`. Implementation sequence: 1. Introduce a queued executor wrapper near the executor/Codex integration layer with FIFO scheduling and active-count bookkeeping. 2. Use `teamConfig.dispatch.workerCount` as the concurrency cap for the default Codex executor path and route default role dependencies through that wrapper. 3. Preserve existing injected-executor behavior and leave all other dispatch concurrency controls untouched. 4. Add unit coverage for capped parallel execution, error propagation, and dependency-resolution wiring. Out of scope: - changing dispatch slot assignment logic - changing planner admission checks - changing lane scheduling semantics - removing any existing concurrency limits.
