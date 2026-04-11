## Why

Implement a lightweight status snapshot API and a 1-second polling workspace status bar that shows active thread totals plus aggregated lane states on the left and host CPU-memory usage on the right, without affecting dispatch scheduling. Add a lightweight live status bar for active thread counts, lane status totals, and host CPU-memory usage. This proposal is one candidate implementation for the request: add a status bar - to record how many running threads, and status count on the left, e.g. how many threads are in coding, how many threads are in review, how many threads are waiting for human approvement, etc. - record CPU/memory usage on the right, refresh in every second.

## What Changes

- Introduce the `live-status-a1-p1-add-live-workspace-status-bar` OpenSpec change for proposal "Add live workspace status bar".
- Implement a lightweight status snapshot API and a 1-second polling workspace status bar that shows active thread totals plus aggregated lane states on the left and host CPU-memory usage on the right, without affecting dispatch scheduling.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities

- `live-status-a1-p1-add-live-workspace-status-bar`: Implement a lightweight status snapshot API and a 1-second polling workspace status bar that shows active thread totals plus aggregated lane states on the left and host CPU-memory usage on the right, without affecting dispatch scheduling.

### Modified Capabilities

- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: OpenSpec-aligned change scope: add a read-only workspace status bar backed by a lightweight status endpoint. Suggested implementation surfaces: - `lib/team/history.ts` or a nearby helper for full-store status aggregation - `app/api/team/status/route.ts` for a dedicated snapshot endpoint - `components/team-status-bar.tsx` for the polling UI - `components/team-workspace.tsx` for placement - `app/globals.css` for layout and responsive styling Design constraints: - Do not reuse the existing thread list endpoint for 1 Hz polling. - Keep counts accurate across all live threads, not just the visible sidebar subset. - Prefer host-level metrics only: CPU percentage from sampled `os.cpus()` deltas and memory percentage/values from `os.totalmem()` and `os.freemem()`. - Handle the first CPU sample and transient fetch failures gracefully in the UI. Acceptance target: - A visible status bar updates every second. - Left-side counts clearly separate active-thread total from lane-status totals. - Right-side metrics show current CPU and memory usage without altering harness dispatch behavior.
