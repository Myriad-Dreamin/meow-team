## Why

Materialize one OpenSpec change that adds App Router error fallbacks plus a root-level client exception reporter, renders readable on-screen exception details for mobile debugging, keeps verbose stacks development-oriented, and validates the result with `pnpm lint` and `pnpm build`. 1 proposal ready: replace the generic localhost client-exception fallback with visible in-app exception details suitable for mobile debugging. This proposal is one candidate implementation for the request: Print exception in the window, which helps view on mobile phone. Application error: a client-side exception has occurred while loading localhost (see the browser console for more information).

## What Changes

- Introduce the `client-error-ui-a1-p1-show-client-side-exceptions-on-screen` OpenSpec change for proposal "Show Client-Side Exceptions On Screen".
- Materialize one OpenSpec change that adds App Router error fallbacks plus a root-level client exception reporter, renders readable on-screen exception details for mobile debugging, keeps verbose stacks development-oriented, and validates the result with `pnpm lint` and `pnpm build`.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities

- `client-error-ui-a1-p1-show-client-side-exceptions-on-screen`: Materialize one OpenSpec change that adds App Router error fallbacks plus a root-level client exception reporter, renders readable on-screen exception details for mobile debugging, keeps verbose stacks development-oriented, and validates the result with `pnpm lint` and `pnpm build`.

### Modified Capabilities

- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Show Client-Side Exceptions On Screen` OpenSpec seed: `client-error-ui-a1-p1-show-client-side-exceptions-on-screen` Objective: Surface uncaught client-side exceptions inside the Next.js UI so a mobile device can display the real failure message without requiring browser-console access. Implementation shape: - Add `app/error.tsx` for route-level client error fallback and `app/global-error.tsx` for root-level crashes. - Mount a small root-level client exception reporter that captures `window` `error` and `unhandledrejection` events. - Share a formatter so both boundary-driven errors and runtime listener errors render the same concise message format. - Keep detailed stack output development-oriented while still showing a readable headline/message in all cases. - Style the surface for narrow screens and touch devices using existing workspace CSS patterns. - Verify with `pnpm lint`, `pnpm build`, and a manual forced-error check on a mobile-sized viewport. Non-goals: - No telemetry pipeline, server persistence, or third-party monitoring. - No large defensive rewrite of existing client components beyond minimal support needed for the error UI. Approval note: This is one coherent proposal and should be materialized as a single OpenSpec change. The pooled coder/reviewer lanes should remain idle until it is explicitly approved. Reference: https://nextjs.org/docs/app/getting-started/error-handling.
