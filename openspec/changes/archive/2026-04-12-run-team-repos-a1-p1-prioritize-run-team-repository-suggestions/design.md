## Context

This change captures proposal "Prioritize Run Team repository suggestions" as OpenSpec change `run-team-repos-a1-p1-prioritize-run-team-repository-suggestions`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Implement history-based repository suggestion ranking in the Run Team picker so repositories used in prior team runs are suggested first by most recent use, while the full configured repository list remains selectable.
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
- Keep the canonical request/PR title as `feat(run/team): Prioritize Run Team repository suggestions`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `feat(run/team)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `feat(run/team): Prioritize Run Team repository suggestions`
- Conventional title metadata: `feat(run/team)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: OpenSpec-aligned change: `prioritize-run-team-repository-suggestions` Deliver: - A repository suggestion helper that reads full team thread history and returns repositories with prior Run Team usage first, sorted by most recent request timestamp descending. - A combined picker model for the Run Team form that keeps all configured repositories selectable, with suggested repositories grouped or ordered ahead of the remaining accessible repositories. - Run Team UI updates that make the suggestion behavior clear without silently overriding an explicit user choice. - Tests covering MRU ordering, deduplication by repository id, repositories with no prior usage, and preservation of the full accessible list. Likely touch points: - `lib/team/history.ts` or a new repository-suggestion helper - `app/page.tsx` - `components/team-workspace.tsx` - `components/team-console.tsx` - history/helper test files Validation: - `pnpm test` - `pnpm lint` - `pnpm fmt:check` - `pnpm build` if the final implementation changes page data flow structurally Pool behavior: - Do not start coder or reviewer lane work until this proposal is explicitly approved.
