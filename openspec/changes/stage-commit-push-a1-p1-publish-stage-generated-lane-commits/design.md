## Context

This change captures proposal "Publish stage-generated lane commits" as OpenSpec change `stage-commit-push-a1-p1-publish-stage-generated-lane-commits`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

The current lane runtime publishes proposal branches during approval and again
after machine review or final archive, but coder and reviewer stages can still
advance the lane head locally without updating the tracked remote branch. The
ordinary flow in `lib/team/coding/reviewing.ts` and the execute-mode flow in
`lib/team/executing/reviewing.ts` both need a shared stage-end publication rule
so remote-sync metadata, planner notes, and retry behavior stay aligned.

## Goals / Non-Goals

**Goals:**
- Publish any new lane head created by coder, reviewer, executor, or execution-reviewer work as soon as that stage finishes.
- Reuse one shared stage-end publication helper around the existing branch-publish path so standard and execute-mode lanes do not drift.
- Keep `latestImplementationCommit`, `pushedCommit`, lane activity, and planner notes truthful about whether the current head is already remote-backed.
- Preserve the existing reviewer-approved rebase plus ready-PR flow while letting already published heads skip redundant pushes.
- Add focused regression coverage for success, no-op, dirty-worktree, direct-commit, and failure paths.

**Non-Goals:**
- Redesign the `planner -> coder -> reviewer` workflow or add new approval checkpoints.
- Expand scope into commit-history UI or broader pull-request feature work.
- Change proposal-approval draft PR creation, final archive semantics, or worker-slot allocation beyond the shared publish helper reuse required here.

## Decisions

- **Add a shared publish helper around `pushLaneBranch`.** The helper should live with the existing git publication utilities, accept the current branch head plus the lane's recorded `pushedCommit`, publish only when the head advanced, and return updated pushed-commit metadata or a blocking failure. Keeping separate publish branches in each runtime was rejected because no-op detection and failure handling would drift immediately.
- **Publish coder and executor output before review starts.** After stage-end dirty-worktree commits are captured, the runtime should resolve the current head and publish it before transitioning to reviewer or execution-reviewer work. Letting review run against a local-only head was rejected because the remote branch, tracking PR, and retry state become stale during the most active part of the lane lifecycle.
- **Publish reviewer feedback before requeue.** When reviewer or execution-reviewer work ends with `needs_revision`, the runtime should detect direct branch commits or dirty reviewer artifacts, create a commit when needed, publish the resulting head, and only then requeue the next implementation pass. Requeueing without publication was rejected because reviewer-authored follow-up artifacts can remain stranded in a reusable worktree and never reach the tracked branch.
- **Treat publication state as explicit lane metadata.** `latestImplementationCommit` should remain the current local lane head, while `pushedCommit` should be updated only when a head is confirmed remote-backed and preserved through downstream PR-refresh or approval failures until a newer local head replaces it. Clearing publication metadata on every transition was rejected because retries and thread history lose the clearest signal about what already reached the remote branch.
- **Reuse the helper in approval-time publish paths.** Reviewer-approved and finalization flows should call the same helper so already published heads skip redundant pushes while still preserving current PR-ready and final archive behavior. Leaving those late-stage publish paths bespoke was rejected because success, no-op, and retry semantics would diverge between stages.
- **Use targeted regression tests as the safety net.** Focused coverage should exercise `lib/team/git.ts`, `lib/team/coding/reviewing.ts`, `lib/team/executing/reviewing.ts`, and the main lane orchestration tests. Relying on manual validation alone was rejected because publish state bugs usually appear only during retries, failures, or reviewer-authored artifact flows.

## Conventional Title

- Canonical request/PR title: `feat(lanes/runtime): Publish stage-generated lane commits`
- Conventional title metadata: `feat(lanes/runtime)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Reviewer artifact capture is easy to miss] -> Commit dirty reviewer or execution-reviewer output before publishing and cover both dirty-worktree and direct-commit cases with regression tests.
- [Remote-sync metadata can drift on retries] -> Centralize publish-state updates in one helper and preserve successful `pushedCommit` records when later PR refresh or approval work fails.
- [Shared helper changes can regress execute-mode lanes] -> Reuse the same helper across standard and execute-mode runtimes and add mirrored coverage for both paths.
- [Blocking publish failures may stop more lanes] -> Surface explicit lane errors and planner notes rather than letting reviewers or requeues continue from a local-only branch head.

Planner deliverable reference: Proposal: `Publish Stage-Generated Lane Commits`
Suggested OpenSpec seed: `publish-stage-generated-lane-commits`
Objective: Extend the lane runtime so coder and reviewer stages publish any new
branch head they create, persist accurate pushed-commit state through requeues
and approvals, and add regression coverage for stage-end publish success and
failure paths.
