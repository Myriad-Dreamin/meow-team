## Context

This change captures proposal "Add live workspace status bar" as OpenSpec change `live-status-a1-p1-add-live-workspace-status-bar`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Implement a lightweight status snapshot API and a 1-second polling workspace status bar that shows active thread totals plus aggregated lane states on the left and host CPU-memory usage on the right, without affecting dispatch scheduling.
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

Planner deliverable reference: OpenSpec-aligned change scope: add a read-only workspace status bar backed by a lightweight status endpoint. Suggested implementation surfaces: - `lib/team/history.ts` or a nearby helper for full-store status aggregation - `app/api/team/status/route.ts` for a dedicated snapshot endpoint - `components/team-status-bar.tsx` for the polling UI - `components/team-workspace.tsx` for placement - `app/globals.css` for layout and responsive styling Design constraints: - Do not reuse the existing thread list endpoint for 1 Hz polling. - Keep counts accurate across all live threads, not just the visible sidebar subset. - Prefer host-level metrics only: CPU percentage from sampled `os.cpus()` deltas and memory percentage/values from `os.totalmem()` and `os.freemem()`. - Handle the first CPU sample and transient fetch failures gracefully in the UI. Acceptance target: - A visible status bar updates every second. - Left-side counts clearly separate active-thread total from lane-status totals. - Right-side metrics show current CPU and memory usage without altering harness dispatch behavior.
