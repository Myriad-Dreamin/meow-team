## Context

This change captures proposal "Group Living Threads by Repository" as OpenSpec change `living-threads-a1-p1-group-living-threads-by-repository`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Restructure the left-side Living Threads tabs into repository sections, remove the long summary line from each tab card, preserve selection and refresh behavior, and keep threads without a repository visible in a fallback group.
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

Planner deliverable reference: OpenSpec-aligned proposal for `meow-team`: 1. Introduce a single change focused on the left Living Threads sidebar, with suggested change name `living-threads-a1-p1-group-by-repository`. 2. Group sidebar threads by repository using the existing `TeamThreadSummary.repository` payload, including a fallback bucket for threads with no repository. 3. Remove the long `workspace-tab-summary` content from sidebar cards and keep the remaining compact metadata useful for scanning. 4. Preserve current behavior for polling, tab selection, active-thread rendering, and thread recency ordering within each repository group. 5. Limit code changes to read-only UI and data-shaping surfaces unless a tiny shared label helper is justified. Expected implementation surfaces: `components/team-workspace.tsx`, `app/globals.css`, and optionally a small helper near existing thread view utilities. 6. Acceptance target: the sidebar visibly shows repository sections, threads still open correctly, no long progress-summary line appears in the left tab cards, and threads without repositories still appear in a clear fallback section. 7. Validation target: run `pnpm lint`; run `pnpm build` before handoff when the final change crosses shared component or type boundaries. This is one coherent proposal and should not start coding or review work until a human approval is recorded.
