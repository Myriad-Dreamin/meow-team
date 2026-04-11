## Context

This change captures proposal "Notify on Attention-Needed Threads" as OpenSpec change `desktop-attention-a1-p1-notify-on-attention-needed-threads`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**

- Add opt-in browser desktop notifications for living threads that newly transition into attention-needed states, starting with proposal approval waits and failures, using existing thread polling data and deduping repeated alerts.
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

Planner deliverable reference: Proposal: `Notify on Attention-Needed Threads` Suggested OpenSpec seed: `desktop-attention-a1-p1-notify-on-attention-needed-threads` Objective: add opt-in browser desktop notifications when a live thread newly enters a human-action-required state, starting with proposal approval waits and failures, without repeating the same alert on every poll. Implementation shape: 1. Anchor notification detection in `components/team-workspace.tsx`, which already polls `/api/team/threads` for all living threads, so alerts work regardless of which thread is open. 2. Add a small client-side notification preference and permission flow, persisted in `localStorage`, so permission is requested explicitly and blocked or unsupported states are visible. 3. Extract a pure helper that classifies attention-needed thread or lane states and builds stable notification fingerprints from existing `TeamThreadSummary` data. 4. Fire notifications only on transitions into a new attention-needed fingerprint; suppress repeats across 5-second refreshes, rerenders, and page reloads where feasible. 5. Treat `awaiting_human_approval` lanes and failed threads or lanes as the initial attention-needed states. Keep normal running, completed, and machine-reviewed states out of scope for the first pass. 6. Keep the change primarily frontend-scoped, likely touching `components/team-workspace.tsx`, a small shared helper near existing thread view utilities, `app/globals.css`, and targeted Vitest coverage for classification and deduping logic. Validation target: add targeted tests for attention detection and repeat suppression, then run `pnpm lint` and `pnpm build`. Scope boundaries and risks: - Notifications only fire while the harness page is open in a browser with Notification API support; no service worker, push delivery, or native background daemon is included. - Permission handling must fail quietly; do not auto-spam permission prompts. - If the owner expects additional attention states, capture that as approval feedback instead of widening the first implementation. Coding-review lanes should stay idle until a human approval arrives.
