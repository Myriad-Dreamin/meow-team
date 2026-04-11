## Why

Push final machine-reviewed lane branches to the configured GitHub remote, persist pushed commit metadata and URLs, and expose per-lane commit hashes clearly in the thread UI with regression coverage. Single proposal: push finalized lane branches to GitHub and show the resulting commit hashes in the thread UI. This proposal is one candidate implementation for the request: Push commits to GitHub, and renders the commit hashes in the thread UI.

## What Changes

- Introduce the `github-thread-commits-a1-p1-push-lane-branches-and-surface-commit-hashes` OpenSpec change for proposal "Push Lane Branches and Surface Commit Hashes".
- Push final machine-reviewed lane branches to the configured GitHub remote, persist pushed commit metadata and URLs, and expose per-lane commit hashes clearly in the thread UI with regression coverage.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities

- `github-thread-commits-a1-p1-push-lane-branches-and-surface-commit-hashes`: Push final machine-reviewed lane branches to the configured GitHub remote, persist pushed commit metadata and URLs, and expose per-lane commit hashes clearly in the thread UI with regression coverage.

### Modified Capabilities

- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Push Lane Branches and Surface Commit Hashes`\nSuggested OpenSpec seed: `push-lane-branches-and-surface-commit-hashes`\nObjective: push the final machine-reviewed lane branch to the repository's GitHub remote and make the resulting commit hash visible in the thread experience.\n\nImplementation shape:\n1. Add git helper support for discovering the push remote, normalizing GitHub web URLs, and pushing a lane branch after the final head commit is known.\n2. Wire the push step into the final lane-completion path in `lib/team/dispatch.ts` after any auto-rebase succeeds, and persist the pushed commit hash plus GitHub URLs on the lane record.\n3. Treat push failure as a blocking delivery error so the lane does not appear successfully published when GitHub never received the branch.\n4. Extend persisted lane and thread types in `lib/team/types.ts` and `lib/team/history.ts` so pushed commit metadata survives reloads and older thread records remain compatible.\n5. Surface commit hashes in `components/thread-detail-panel.tsx` using shared helpers from `components/thread-view-utils.ts`, and mirror the same commit presentation in other thread surfaces only where it keeps the UI consistent.\n6. Add regression tests for push helpers and commit-hash rendering, then run `pnpm lint` and `pnpm build`.\n\nScope boundaries and risks:\n- Stay on git CLI plus derived GitHub URLs; do not expand into GitHub API PR automation.\n- Assume `origin` remains the canonical GitHub push remote for this repository.\n- Keep this as one approval unit because backend push metadata and thread rendering depend on the same persisted state. Coding-review lanes stay idle until approval.
