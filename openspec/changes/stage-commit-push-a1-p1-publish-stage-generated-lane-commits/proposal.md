## Why

Lane branches currently publish only at later machine-review or final-archive checkpoints, so coder and reviewer commits can exist only in the reusable worktree while the tracked remote branch and PR still point at an older head. This proposal closes that gap by publishing any new stage-generated lane commit as soon as the coder or reviewer stage finishes, keeping lane state and remote-sync metadata truthful throughout retries, approvals, and failures.

## What Changes

- Introduce the `stage-commit-push-a1-p1-publish-stage-generated-lane-commits` OpenSpec change for proposal "Publish stage-generated lane commits".
- Add a shared stage-end branch publication flow that compares the current lane head with the last recorded `pushedCommit`, publishes only when the head advanced, and returns updated pushed-commit metadata plus blocking failure details.
- Publish coder and executor commits immediately after implementation finishes and before reviewer or execution-reviewer work begins, so review never runs against a local-only head.
- Publish reviewer and execution-reviewer feedback commits for `needs_revision` outcomes, including dirty-worktree artifacts that the harness must commit first, before requeueing the lane.
- Tighten `latestImplementationCommit`, `pushedCommit`, lane events, and planner notes so thread history stays clear about whether the latest head is already remote-backed.
- Add regression coverage for stage-end publish success, no-op publish reuse, reviewer-authored feedback commits, dirty-worktree reviewer artifacts, direct agent commits, and publish failures across standard and execute-mode lanes.

## Capabilities

### New Capabilities
- `stage-commit-push-a1-p1-publish-stage-generated-lane-commits`: Extend the lane runtime so coder and reviewer stages publish any new branch head they create, persist accurate pushed-commit state through requeues and approvals, and cover publish success and failure paths with regression tests.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `feat(lanes/runtime): Publish stage-generated lane commits`
- Conventional title metadata: `feat(lanes/runtime)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected code: `lib/team/git.ts`, `lib/team/coding/reviewing.ts`, `lib/team/executing/reviewing.ts`, lane-state/history surfaces, and regression coverage around lane publication
- Coding-review execution: pooled `planner -> coder -> reviewer` lanes plus execute-mode `executor -> execution-reviewer` lanes using reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Scope boundaries: keep proposal-approval draft PR creation, final archive behavior, and final PR refresh intact except where shared publish helpers remove duplication; do not expand this into commit-history UI work
- Main risk: reviewer-stage artifact handling must preserve reviewer-authored tests or todo artifacts and must not silently continue when an intermediate publish fails
- Approval note: coding-review lanes stay idle until a human approves this proposal
