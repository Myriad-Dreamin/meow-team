## Context

This change captures proposal "Fix managed-worktree `.git-local` PR failure" as OpenSpec change `worktree-git-a3-p1-fix-managed-worktree-git-local-pr-failure`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Implement one OpenSpec-aligned change that opens or refreshes a GitHub draft PR immediately after proposal approval, preserves that same PR through coder/reviewer/final-archive flow, rebases onto `main` and requeues the coding-review cycle on conflicts before marking the PR ready after machine review, and fixes managed-worktree git/gh subprocess resolution so the stale `node_modules/.bin/git` -> `.git-local` wrapper can no longer break proposal-time or final PR operations.
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
- Keep the canonical request/PR title as `fix(team/worktree): Fix managed-worktree `.git-local` PR failure`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `fix(team/worktree)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `fix(team/worktree): Fix managed-worktree `.git-local` PR failure`
- Conventional title metadata: `fix(team/worktree)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Recommended proposal set: 1 proposal. Proposal: Fix managed-worktree `.git-local` PR failure. Why this stays one proposal: the request is one lifecycle change across the same surfaces. Proposal approval, reviewer completion, final archive, and the `.git-local` failure all converge in `lib/team/network.ts` lane state transitions plus `lib/git/ops.ts` git/gh subprocess handling. Splitting this would create cross-proposal coupling and make approval semantics less clear. Implementation shape: 1. Extend proposal approval so `approveLaneProposal()` and the proposal-approval stage do more than queue work: ensure the branch/worktree is available, push the current proposal branch head, create or refresh a GitHub draft PR, persist PR metadata as the lane’s tracking PR, and then queue coding/review. 2. Keep that same PR for the rest of the lane lifecycle. `approveLanePullRequest()` should stop being the first PR creation point and instead refresh/finalize the already-open PR after archive work completes. 3. Reuse the existing reviewer-success conflict path in `runLaneCycle()`: before machine review completion is considered done, rebase onto `main`; if auto-rebase fails, requeue the coding-review cycle for conflict resolution; only after a clean rebase plus successful push should the existing PR be marked ready for review (undrafted). 4. Harden managed-worktree git/gh execution by resolving stable system binaries or sanitizing PATH so GitHub CLI cannot pick a worktree-local `node_modules/.bin/git` shim. 5. Update thread/lane presentation and regression coverage for draft PR state after proposal approval, ready PR state after machine review, final archive PR refresh, conflict retries, and the managed-worktree `.git-local` failure. Confirmed failure reason: the active managed worktree `.meow-team-worktrees/meow-2` contains `node_modules/.bin/git`, a wrapper that hardcodes `--git-dir=$worktree/.git-local --work-tree=$worktree`. Running `./node_modules/.bin/git status --short` there reproduces `fatal: not a git repository: '/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-2/.git-local'`. Because `runGh()` executes with `cwd` set to the managed worktree and the process PATH begins with relative `./node_modules/.bin`, GitHub CLI can resolve that wrapper and fail during PR operations. Scope boundaries and assumptions: - Keep the workflow order `planner -> coder -> reviewer`. - Keep the existing final human approval/archive step unless implementation proves it is redundant; the PR should already exist by then and only be refreshed/finalized there. - Do not automate merge. - Do not broaden worktree allocation or branch naming unless required to support the early-PR path. - Missing GitHub auth or push rights should remain explicit blocking failures. Pool note: the coding-review pool should remain idle until a human approves this regenerated proposal.
