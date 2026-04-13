## Context

This change captures proposal "Extract GitHub platform adapter and interfaces" as OpenSpec change `git-platform-a1-p1-extract-github-platform-adapter-and-interfaces`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Introduce `lib/platform` contracts and a `lib/platform/gh` implementation for GitHub remote normalization, branch publishing, and pull-request synchronization, then rewire harness callers and tests to use that adapter without changing current GitHub behavior.
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
- Keep the canonical request/PR title as `refactor(platform/gh): Extract GitHub platform adapter and interfaces`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `refactor(platform/gh)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `refactor(platform/gh): Extract GitHub platform adapter and interfaces`
- Conventional title metadata: `refactor(platform/gh)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal 1 centers on a contained adapter refactor rather than a wider provider expansion. The repository already has GitHub-specific behavior spread across `lib/cli-tools/gh.ts`, `lib/git/ops.ts`, `lib/team/git.ts`, and `lib/team/network.ts`, with matching tests in `lib/cli-tools/exec.test.ts`, `lib/team/git.test.ts`, and `lib/team/network.test.ts`. The approved implementation should carve that behavior into `lib/platform/gh`, introduce a small interface layer for online git platform operations, and leave the rest of the harness depending on those contracts instead of GitHub-named helpers. Expected execution sequence: 1. Define the platform contracts and shared types needed by current callers. 2. Move the GitHub CLI and GitHub-specific remote/PR helpers into `lib/platform/gh`. 3. Rewire `lib/team/git.ts` and `lib/team/network.ts` to consume the adapter surface. 4. Keep persistence and workflow behavior unchanged except for minimal type adjustments needed to support the new boundary. 5. Update mocks and tests, then run formatting, linting, targeted vitest coverage, and build validation if feasible. Approval criteria: - Git-only utilities remain separate from online-platform behavior. - Orchestration no longer imports GitHub-specific helpers directly. - Current GitHub branch push and pull-request flows behave the same after the move. - No second provider is introduced in this change. Until the owner approves, the shared coder/reviewer pool should remain idle for this request group.
