## Why

Restructure the left-side Living Threads tabs into repository sections, remove the long summary line from each tab card, preserve selection and refresh behavior, and keep threads without a repository visible in a fallback group. One proposal: reorganize the left Living Threads sidebar by repository and remove the long summary line from each thread tab. This proposal is one candidate implementation for the request: for the left side Living Threads tabs, 1. don't show long workspace-tab-summary. 2. group threads by repository.

## What Changes

- Introduce the `living-threads-a1-p1-group-living-threads-by-repository` OpenSpec change for proposal "Group Living Threads by Repository".
- Restructure the left-side Living Threads tabs into repository sections, remove the long summary line from each tab card, preserve selection and refresh behavior, and keep threads without a repository visible in a fallback group.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `living-threads-a1-p1-group-living-threads-by-repository`: Restructure the left-side Living Threads tabs into repository sections, remove the long summary line from each tab card, preserve selection and refresh behavior, and keep threads without a repository visible in a fallback group.

### Modified Capabilities
- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: OpenSpec-aligned proposal for `meow-team`: 1. Introduce a single change focused on the left Living Threads sidebar, with suggested change name `living-threads-a1-p1-group-by-repository`. 2. Group sidebar threads by repository using the existing `TeamThreadSummary.repository` payload, including a fallback bucket for threads with no repository. 3. Remove the long `workspace-tab-summary` content from sidebar cards and keep the remaining compact metadata useful for scanning. 4. Preserve current behavior for polling, tab selection, active-thread rendering, and thread recency ordering within each repository group. 5. Limit code changes to read-only UI and data-shaping surfaces unless a tiny shared label helper is justified. Expected implementation surfaces: `components/team-workspace.tsx`, `app/globals.css`, and optionally a small helper near existing thread view utilities. 6. Acceptance target: the sidebar visibly shows repository sections, threads still open correctly, no long progress-summary line appears in the left tab cards, and threads without repositories still appear in a clear fallback section. 7. Validation target: run `pnpm lint`; run `pnpm build` before handoff when the final change crosses shared component or type boundaries. This is one coherent proposal and should not start coding or review work until a human approval is recorded.
