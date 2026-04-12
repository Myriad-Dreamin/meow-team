## Why

Implement a shared queued `TeamStructuredExecutor` for the default Codex executor, cap concurrent executions at `teamConfig.dispatch.workerCount`, keep all other concurrency controls unchanged, and cover the wiring with focused tests. Queue default Codex executor calls behind a shared `TeamStructuredExecutor` limiter set to `dispatch.workerCount`. This proposal is one candidate implementation for the request: Add queued executor: - the queued executor is used to limit the concurrency of codex executor which also implements `TeamStructuredExecutor`. - the limit is set to `dispatch.workerCount`, and all of other code about concurrency limit are left untouched for now.

## What Changes

- Introduce the `queued-codex-exec-a1-p1-add-queued-codex-executor` OpenSpec change for proposal "Add queued Codex executor".
- Implement a shared queued `TeamStructuredExecutor` for the default Codex executor, cap concurrent executions at `teamConfig.dispatch.workerCount`, keep all other concurrency controls unchanged, and cover the wiring with focused tests.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `queued-codex-exec-a1-p1-add-queued-codex-executor`: Implement a shared queued `TeamStructuredExecutor` for the default Codex executor, cap concurrent executions at `teamConfig.dispatch.workerCount`, keep all other concurrency controls unchanged, and cover the wiring with focused tests.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `feat: Add queued Codex executor`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: OpenSpec-ready proposal: `add-queued-codex-executor`. Implementation sequence: 1. Introduce a queued executor wrapper near the executor/Codex integration layer with FIFO scheduling and active-count bookkeeping. 2. Use `teamConfig.dispatch.workerCount` as the concurrency cap for the default Codex executor path and route default role dependencies through that wrapper. 3. Preserve existing injected-executor behavior and leave all other dispatch concurrency controls untouched. 4. Add unit coverage for capped parallel execution, error propagation, and dependency-resolution wiring. Out of scope: - changing dispatch slot assignment logic - changing planner admission checks - changing lane scheduling semantics - removing any existing concurrency limits.
