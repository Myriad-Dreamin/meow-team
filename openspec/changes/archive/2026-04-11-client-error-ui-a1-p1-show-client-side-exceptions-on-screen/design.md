## Context

This change captures proposal "Show Client-Side Exceptions On Screen" as OpenSpec change `client-error-ui-a1-p1-show-client-side-exceptions-on-screen`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Materialize one OpenSpec change that adds App Router error fallbacks plus a root-level client exception reporter, renders readable on-screen exception details for mobile debugging, keeps verbose stacks development-oriented, and validates the result with `pnpm lint` and `pnpm build`.
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

Planner deliverable reference: Proposal: `Show Client-Side Exceptions On Screen` OpenSpec seed: `client-error-ui-a1-p1-show-client-side-exceptions-on-screen` Objective: Surface uncaught client-side exceptions inside the Next.js UI so a mobile device can display the real failure message without requiring browser-console access. Implementation shape: - Add `app/error.tsx` for route-level client error fallback and `app/global-error.tsx` for root-level crashes. - Mount a small root-level client exception reporter that captures `window` `error` and `unhandledrejection` events. - Share a formatter so both boundary-driven errors and runtime listener errors render the same concise message format. - Keep detailed stack output development-oriented while still showing a readable headline/message in all cases. - Style the surface for narrow screens and touch devices using existing workspace CSS patterns. - Verify with `pnpm lint`, `pnpm build`, and a manual forced-error check on a mobile-sized viewport. Non-goals: - No telemetry pipeline, server persistence, or third-party monitoring. - No large defensive rewrite of existing client components beyond minimal support needed for the error UI. Approval note: This is one coherent proposal and should be materialized as a single OpenSpec change. The pooled coder/reviewer lanes should remain idle until it is explicitly approved. Reference: https://nextjs.org/docs/app/getting-started/error-handling.
