## Context

This change captures proposal "Flatten, fold, and sort Living Threads sidebar" as OpenSpec change `sidebar-threads-a1-p1-flatten-fold-and-sort-living-threads-sidebar`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Suggested OpenSpec change seed: `living-threads-a1-p1-flatten-fold-and-sort-sidebar-groups`. Update the left Living Threads sidebar so repository groups render as flat sections instead of bordered containers, each group can be collapsed or expanded without breaking active-thread selection, repository groups and threads are ordered alphabetically with stable tie-breakers, and each thread item uses a three-line layout: title, `Thread <short-id> - <status>`, and `Updated <timestamp>`. Keep scope to the sidebar rendering/data-shaping surfaces plus CSS and targeted regression tests, while preserving existing polling, fallback `No Repository` handling, run/settings tabs, and thread detail behavior.
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
- Keep the canonical request/PR title as `feat: Flatten, fold, and sort Living Threads sidebar`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `feat` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `feat: Flatten, fold, and sort Living Threads sidebar`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Single-proposal recommendation. This request is a focused refinement of the existing repository-grouped Living Threads sidebar, so splitting it would add approval overhead without reducing implementation risk. Preferred proposal: `Flatten, fold, and sort Living Threads sidebar`. Suggested OpenSpec change seed: `living-threads-a1-p1-flatten-fold-and-sort-sidebar-groups`. Best fit capability impact: extend the existing `living-threads-by-repository` sidebar capability rather than introduce a separate backend feature. Implementation shape: 1. Keep repository grouping in the left sidebar, but remove the bordered container treatment so groups read as flat navigation sections. 2. Add per-group collapse/expand controls in the workspace sidebar flow; preserve fold state across polling refreshes and auto-expand a group when one of its threads is selected. 3. Sort repository groups alphabetically for scanability, keep the fallback `No Repository` group visible, and sort threads alphabetically by display title within each group with a stable tie-breaker such as `threadId`. 4. Rework each thread item into a strict three-line layout: title; `Thread <short-id> - <status>` using existing status labels; `Updated <timestamp>` using the current timestamp formatter. 5. Adjust sidebar CSS so the flattened groups, fold affordances, active-thread state, and mobile layout remain readable without the current group-card chrome. 6. Add regression coverage around the grouping/sorting helper and any extracted sidebar metadata formatter; validate with `pnpm lint`, `pnpm test` where helper logic is covered, and `pnpm build` if the final implementation crosses shared layout surfaces. Scope boundaries: - No backend, storage, or API contract changes are expected. - Preserve current polling cadence, thread selection behavior, thread detail rendering, and run/settings navigation. - Do not change the thread detail panel or status bar as part of this proposal. Assumptions and risks: - "Alphabetical order" is interpreted as case-insensitive ordering by displayed thread title within each repository group; repository groups should also be alphabetized, with `No Repository` last. - Flattening means removing container chrome, not removing repository headers themselves. - Collapse behavior should not reset every 5 seconds during polling; cross-session persistence is optional and not required for approval. - Active-thread visibility needs care so collapsing or refreshing a group does not make the selected thread state confusing. Approval note: this is one coherent proposal. Coding-review lanes should stay idle until a human approval arrives.
