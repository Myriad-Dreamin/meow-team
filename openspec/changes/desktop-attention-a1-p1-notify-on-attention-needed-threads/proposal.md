## Why

Add opt-in browser desktop notifications for living threads that newly transition into attention-needed states, starting with proposal approval waits and failures, using existing thread polling data and deduping repeated alerts. Single proposal to add opt-in browser desktop notifications when a living thread newly awaits approval or fails. This proposal is one candidate implementation for the request: create desktop notification if a thread requires user attention.

## What Changes

- Introduce the `desktop-attention-a1-p1-notify-on-attention-needed-threads` OpenSpec change for proposal "Notify on Attention-Needed Threads".
- Add opt-in browser desktop notifications for living threads that newly transition into attention-needed states, starting with proposal approval waits and failures, using existing thread polling data and deduping repeated alerts.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `desktop-attention-a1-p1-notify-on-attention-needed-threads`: Add opt-in browser desktop notifications for living threads that newly transition into attention-needed states, starting with proposal approval waits and failures, using existing thread polling data and deduping repeated alerts.

### Modified Capabilities
- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Notify on Attention-Needed Threads` Suggested OpenSpec seed: `desktop-attention-a1-p1-notify-on-attention-needed-threads` Objective: add opt-in browser desktop notifications when a live thread newly enters a human-action-required state, starting with proposal approval waits and failures, without repeating the same alert on every poll. Implementation shape: 1. Anchor notification detection in `components/team-workspace.tsx`, which already polls `/api/team/threads` for all living threads, so alerts work regardless of which thread is open. 2. Add a small client-side notification preference and permission flow, persisted in `localStorage`, so permission is requested explicitly and blocked or unsupported states are visible. 3. Extract a pure helper that classifies attention-needed thread or lane states and builds stable notification fingerprints from existing `TeamThreadSummary` data. 4. Fire notifications only on transitions into a new attention-needed fingerprint; suppress repeats across 5-second refreshes, rerenders, and page reloads where feasible. 5. Treat `awaiting_human_approval` lanes and failed threads or lanes as the initial attention-needed states. Keep normal running, completed, and machine-reviewed states out of scope for the first pass. 6. Keep the change primarily frontend-scoped, likely touching `components/team-workspace.tsx`, a small shared helper near existing thread view utilities, `app/globals.css`, and targeted Vitest coverage for classification and deduping logic. Validation target: add targeted tests for attention detection and repeat suppression, then run `pnpm lint` and `pnpm build`. Scope boundaries and risks: - Notifications only fire while the harness page is open in a browser with Notification API support; no service worker, push delivery, or native background daemon is included. - Permission handling must fail quietly; do not auto-spam permission prompts. - If the owner expects additional attention states, capture that as approval feedback instead of widening the first implementation. Coding-review lanes should stay idle until a human approval arrives.
