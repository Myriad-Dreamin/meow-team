## Context

This change captures proposal "stabilize lowercase request titles" as OpenSpec change `request-title-case-a1-p1-stabilize-lowercase-request-titles`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Repair the canonical title pipeline so single-proposal request groups no longer surface title-cased planner subjects as the final request or PR title, align title-producing prompts with the lowercase-initial rule where needed, and add regression coverage for shared request-title formatting and planning metadata generation.
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
- Keep the canonical request/PR title as `fix(planning/request-title): stabilize lowercase request titles`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `fix(planning/request-title)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `fix(planning/request-title): stabilize lowercase request titles`
- Conventional title metadata: `fix(planning/request-title)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Recommended proposal set: 1 proposal. This request looks like a single implementation lane, not multiple independent workstreams. The evidence points to canonical title assembly preserving planner task casing for single-proposal requests rather than a UI transform. The practical fix should therefore focus on the shared title pipeline first, then align prompts and tests with the chosen lowercase rule. Why this stays one proposal: - The bug spans one cohesive path: request-title generation, planner task titles, canonical title assembly, and regression coverage. - Splitting prompt work from formatter/orchestration work would risk approving only half of the contract, which would leave uppercase titles reappearing through whichever path was not updated. - The validation burden is shared across the same tests and the same title helpers. Expected implementation boundaries: - Inspect and adjust the canonical title source-selection path in `lib/team/request-title.ts` and `lib/team/coding/plan.ts`. - Update title-producing prompts only where they materially influence canonical or PR title text. - Refresh request-title and planning-flow tests so they assert the approved lowercase-initial behavior instead of the current capitalized snapshots. - Keep unrelated UI styling, branch-prefix behavior, and repository-dispatch flow unchanged. Open risk: - If the team still wants Title Case proposal names in planner output but lowercase canonical request and PR titles, the coder will need to separate proposal-display titles from canonical subject formatting instead of forcing one representation everywhere. Validation target: - `pnpm fmt` - `pnpm lint` - targeted Vitest for `lib/team/request-title.test.ts`, `lib/team/roles/request-title.test.ts`, and `lib/team/coding/index.test.ts` - `pnpm build` if shared prompt/type artifacts or title helpers change Approval note: - Materialize this as one OpenSpec change. The pooled coder/reviewer lanes should remain idle until approval arrives.
