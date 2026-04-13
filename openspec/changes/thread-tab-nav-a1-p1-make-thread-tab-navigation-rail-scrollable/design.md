## Context

This change captures proposal "Make thread tab navigation rail scrollable" as OpenSpec change `thread-tab-nav-a1-p1-make-thread-tab-navigation-rail-scrollable`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Materialize an OpenSpec change for the selected thread tab's right-side navigation rail: update the thread-detail rail layout so long anchor lists get an independent scroll region, preserve sticky and active-anchor behavior across desktop and narrow breakpoints, and validate usability with a dense timeline without changing thread data or left-sidebar behavior.
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
- Keep the canonical request/PR title as `fix: Make thread tab navigation rail scrollable`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `fix` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `fix: Make thread tab navigation rail scrollable`
- Conventional title metadata: `fix`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Single proposal recommended. Suggested OpenSpec seed: `thread-tab-nav-scroll`. Objective: fix the right-side navigation rail in the selected thread tab so it becomes reliably scrollable for long timelines. The current thread-detail view already renders a dedicated rail container in `components/thread-detail-timeline.tsx` and already tries to keep the active anchor visible, so the approved work should focus on the CSS/layout contract in `app/globals.css` and any minimal component adjustments needed to make that scroll region real. Implementation shape: - constrain the rail card/link list so the anchor list can scroll independently from the main timeline content - preserve sticky desktop behavior and the current smaller-screen capped rail behavior - verify active-anchor highlighting and rail auto-scroll still work after the layout fix - validate the result with a long thread so both the main timeline and the rail remain usable Scope boundaries: - do not change timeline anchor generation, approval flows, or sidebar repository/thread navigation - do not expand this into a broader thread-tab redesign Approval note: this is one coherent UI fix. The shared coder/reviewer pool stays idle until the owner approves it.
