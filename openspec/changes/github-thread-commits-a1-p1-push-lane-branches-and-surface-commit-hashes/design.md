## Context

This change captures proposal "Push Lane Branches and Surface Commit Hashes" as OpenSpec change `github-thread-commits-a1-p1-push-lane-branches-and-surface-commit-hashes`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Push final machine-reviewed lane branches to the configured GitHub remote, persist pushed commit metadata and URLs, and expose per-lane commit hashes clearly in the thread UI with regression coverage.
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

Planner deliverable reference: Proposal: `Push Lane Branches and Surface Commit Hashes`\nSuggested OpenSpec seed: `push-lane-branches-and-surface-commit-hashes`\nObjective: push the final machine-reviewed lane branch to the repository's GitHub remote and make the resulting commit hash visible in the thread experience.\n\nImplementation shape:\n1. Add git helper support for discovering the push remote, normalizing GitHub web URLs, and pushing a lane branch after the final head commit is known.\n2. Wire the push step into the final lane-completion path in `lib/team/dispatch.ts` after any auto-rebase succeeds, and persist the pushed commit hash plus GitHub URLs on the lane record.\n3. Treat push failure as a blocking delivery error so the lane does not appear successfully published when GitHub never received the branch.\n4. Extend persisted lane and thread types in `lib/team/types.ts` and `lib/team/history.ts` so pushed commit metadata survives reloads and older thread records remain compatible.\n5. Surface commit hashes in `components/thread-detail-panel.tsx` using shared helpers from `components/thread-view-utils.ts`, and mirror the same commit presentation in other thread surfaces only where it keeps the UI consistent.\n6. Add regression tests for push helpers and commit-hash rendering, then run `pnpm lint` and `pnpm build`.\n\nScope boundaries and risks:\n- Stay on git CLI plus derived GitHub URLs; do not expand into GitHub API PR automation.\n- Assume `origin` remains the canonical GitHub push remote for this repository.\n- Keep this as one approval unit because backend push metadata and thread rendering depend on the same persisted state. Coding-review lanes stay idle until approval.
