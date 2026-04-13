## Why

Introduce `lib/platform` contracts and a `lib/platform/gh` implementation for GitHub remote normalization, branch publishing, and pull-request synchronization, then rewire harness callers and tests to use that adapter without changing current GitHub behavior. Create one refactor proposal to isolate the existing GitHub adapter under `lib/platform/gh`, define platform contracts, and preserve current GitHub push and PR behavior. This proposal is one candidate implementation for the request: split gh implementation into lib/platform/gh and define interfaces. This should help us to implement other online git platforms in the future.

## What Changes

- Introduce the `git-platform-a1-p1-extract-github-platform-adapter-and-interfaces` OpenSpec change for proposal "Extract GitHub platform adapter and interfaces".
- Introduce `lib/platform` contracts and a `lib/platform/gh` implementation for GitHub remote normalization, branch publishing, and pull-request synchronization, then rewire harness callers and tests to use that adapter without changing current GitHub behavior.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `git-platform-a1-p1-extract-github-platform-adapter-and-interfaces`: Introduce `lib/platform` contracts and a `lib/platform/gh` implementation for GitHub remote normalization, branch publishing, and pull-request synchronization, then rewire harness callers and tests to use that adapter without changing current GitHub behavior.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `refactor(platform/gh): Extract GitHub platform adapter and interfaces`
- Conventional title metadata: `refactor(platform/gh)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal 1 centers on a contained adapter refactor rather than a wider provider expansion. The repository already has GitHub-specific behavior spread across `lib/cli-tools/gh.ts`, `lib/git/ops.ts`, `lib/team/git.ts`, and `lib/team/network.ts`, with matching tests in `lib/cli-tools/exec.test.ts`, `lib/team/git.test.ts`, and `lib/team/network.test.ts`. The approved implementation should carve that behavior into `lib/platform/gh`, introduce a small interface layer for online git platform operations, and leave the rest of the harness depending on those contracts instead of GitHub-named helpers. Expected execution sequence: 1. Define the platform contracts and shared types needed by current callers. 2. Move the GitHub CLI and GitHub-specific remote/PR helpers into `lib/platform/gh`. 3. Rewire `lib/team/git.ts` and `lib/team/network.ts` to consume the adapter surface. 4. Keep persistence and workflow behavior unchanged except for minimal type adjustments needed to support the new boundary. 5. Update mocks and tests, then run formatting, linting, targeted vitest coverage, and build validation if feasible. Approval criteria: - Git-only utilities remain separate from online-platform behavior. - Orchestration no longer imports GitHub-specific helpers directly. - Current GitHub branch push and pull-request flows behave the same after the move. - No second provider is introduced in this change. Until the owner approves, the shared coder/reviewer pool should remain idle for this request group.
