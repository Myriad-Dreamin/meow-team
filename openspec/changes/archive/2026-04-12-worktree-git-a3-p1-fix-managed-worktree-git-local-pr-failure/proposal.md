## Why

Implement one OpenSpec-aligned change that opens or refreshes a GitHub draft PR immediately after proposal approval, preserves that same PR through coder/reviewer/final-archive flow, rebases onto `main` and requeues the coding-review cycle on conflicts before marking the PR ready after machine review, and fixes managed-worktree git/gh subprocess resolution so the stale `node_modules/.bin/git` -> `.git-local` wrapper can no longer break proposal-time or final PR operations. Create the draft tracking PR on proposal approval, preserve it through coding/review/archive, undraft it only after successful reviewer-approved rebase onto `main`, and harden managed-worktree git/gh execution against the `.git-local` wrapper failure. This proposal is one candidate implementation for the request: Once human approved planner, open a PR to trace changes. Also find the reason we met an error on PR fatal: not a git repository: '/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-2/.git-local'.

## What Changes

- Introduce the `worktree-git-a3-p1-fix-managed-worktree-git-local-pr-failure` OpenSpec change for proposal "Fix managed-worktree `.git-local` PR failure".
- Implement one OpenSpec-aligned change that opens or refreshes a GitHub draft PR immediately after proposal approval, preserves that same PR through coder/reviewer/final-archive flow, rebases onto `main` and requeues the coding-review cycle on conflicts before marking the PR ready after machine review, and fixes managed-worktree git/gh subprocess resolution so the stale `node_modules/.bin/git` -> `.git-local` wrapper can no longer break proposal-time or final PR operations.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `worktree-git-a3-p1-fix-managed-worktree-git-local-pr-failure`: Implement one OpenSpec-aligned change that opens or refreshes a GitHub draft PR immediately after proposal approval, preserves that same PR through coder/reviewer/final-archive flow, rebases onto `main` and requeues the coding-review cycle on conflicts before marking the PR ready after machine review, and fixes managed-worktree git/gh subprocess resolution so the stale `node_modules/.bin/git` -> `.git-local` wrapper can no longer break proposal-time or final PR operations.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `fix(team/worktree): Fix managed-worktree `.git-local` PR failure`
- Conventional title metadata: `fix(team/worktree)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Recommended proposal set: 1 proposal. Proposal: Fix managed-worktree `.git-local` PR failure. Why this stays one proposal: the request is one lifecycle change across the same surfaces. Proposal approval, reviewer completion, final archive, and the `.git-local` failure all converge in `lib/team/network.ts` lane state transitions plus `lib/git/ops.ts` git/gh subprocess handling. Splitting this would create cross-proposal coupling and make approval semantics less clear. Implementation shape: 1. Extend proposal approval so `approveLaneProposal()` and the proposal-approval stage do more than queue work: ensure the branch/worktree is available, push the current proposal branch head, create or refresh a GitHub draft PR, persist PR metadata as the lane’s tracking PR, and then queue coding/review. 2. Keep that same PR for the rest of the lane lifecycle. `approveLanePullRequest()` should stop being the first PR creation point and instead refresh/finalize the already-open PR after archive work completes. 3. Reuse the existing reviewer-success conflict path in `runLaneCycle()`: before machine review completion is considered done, rebase onto `main`; if auto-rebase fails, requeue the coding-review cycle for conflict resolution; only after a clean rebase plus successful push should the existing PR be marked ready for review (undrafted). 4. Harden managed-worktree git/gh execution by resolving stable system binaries or sanitizing PATH so GitHub CLI cannot pick a worktree-local `node_modules/.bin/git` shim. 5. Update thread/lane presentation and regression coverage for draft PR state after proposal approval, ready PR state after machine review, final archive PR refresh, conflict retries, and the managed-worktree `.git-local` failure. Confirmed failure reason: the active managed worktree `.meow-team-worktrees/meow-2` contains `node_modules/.bin/git`, a wrapper that hardcodes `--git-dir=$worktree/.git-local --work-tree=$worktree`. Running `./node_modules/.bin/git status --short` there reproduces `fatal: not a git repository: '/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-2/.git-local'`. Because `runGh()` executes with `cwd` set to the managed worktree and the process PATH begins with relative `./node_modules/.bin`, GitHub CLI can resolve that wrapper and fail during PR operations. Scope boundaries and assumptions: - Keep the workflow order `planner -> coder -> reviewer`. - Keep the existing final human approval/archive step unless implementation proves it is redundant; the PR should already exist by then and only be refreshed/finalized there. - Do not automate merge. - Do not broaden worktree allocation or branch naming unless required to support the early-PR path. - Missing GitHub auth or push rights should remain explicit blocking failures. Pool note: the coding-review pool should remain idle until a human approves this regenerated proposal.
