## Why

Separate machine-reviewed approval from proposal approval, show the approve action in Machine Reviewed state, archive the approved lane's OpenSpec proposal on-branch, and create or refresh a GitHub PR from that branch into main after human approval. Add a post-machine-review approval and finalization path that archives the lane OpenSpec change and opens a GitHub PR. This proposal is one candidate implementation for the request: When in "Machine Reviewed" state, I cannot see an approve button. After human approved, continue archive thread (openspec proposals), and make a GitHub PR from the branch to request merge into main.

## What Changes

- Introduce the `machine-review-pr-a1-p1-complete-machine-reviewed-approval-archive-and-g` OpenSpec change for proposal "Complete Machine-Reviewed Approval, Archive, and GitHub PR Flow".
- Separate machine-reviewed approval from proposal approval, show the approve action in Machine Reviewed state, archive the approved lane's OpenSpec proposal on-branch, and create or refresh a GitHub PR from that branch into main after human approval.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities

- `machine-review-pr-a1-p1-complete-machine-reviewed-approval-archive-and-g`: Separate machine-reviewed approval from proposal approval, show the approve action in Machine Reviewed state, archive the approved lane's OpenSpec proposal on-branch, and create or refresh a GitHub PR from that branch into main after human approval.

### Modified Capabilities

- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Approve Machine-Reviewed Lanes and Finalize PR Delivery` Suggested OpenSpec seed: `machine-reviewed-approval-and-archive-pr-flow` Objective: when a lane reaches Machine Reviewed, surface a human approval action that finalizes the reviewed branch by archiving its materialized OpenSpec proposal and opening or refreshing a GitHub PR into `main`. Implementation shape: 1. Split approval stages. Preserve the existing proposal-approval path for `lane.status === "awaiting_human_approval"`, but when reviewer approval completes, set pull-request state to a real post-review human-approval wait instead of treating the lane as fully finalized. 2. Replace the placeholder `approveLanePullRequest = approveLaneProposal` behavior with a real finalizer. Extend the approval API and UI contract so Machine Reviewed lanes can trigger post-review human approval without re-entering the coding queue. 3. On final human approval, reopen the lane branch in a managed worktree, archive only that lane's `openspec/changes/<change>` directory to `openspec/changes/archive/YYYY-MM-DD-<change>`, commit and repush the branch head, then create or refresh a GitHub PR into the resolved base branch using the reviewer-generated PR title and summary. 4. Persist finalization results in lane and thread history: human-approval timestamps, archive outcome, GitHub PR URL and status, updated branch-head metadata, and user-facing events or planner notes so the archive continuation is visible in the existing thread. 5. Update thread UI surfaces to show the correct approve button and copy in Machine Reviewed state and expose the resulting GitHub PR link or status, then add regression coverage for approval-state derivation, archive and PR success and failure, and button visibility. Validate with `pnpm lint` and `pnpm build`. Scope boundaries and risks: - Keep the configured workflow as `planner -> coder -> reviewer`; post-review approval should be a system finalization step, not a new pooled role, unless implementation proves branch mutation cannot be done safely without one. - Reuse existing git and `gh` CLI tooling plus current remote and base-branch configuration. If GitHub auth or push prerequisites are missing, surface a blocking lane error instead of silently skipping PR creation. - Do not automate merge, deployment, or broad OpenSpec main-spec syncing in this change. The focused outcome is: the user sees an approve action in Machine Reviewed, approves it, the proposal change is archived on the lane branch, and a GitHub PR is opened from that branch to `main`. - This is one coherent proposal. Coding-review lanes should remain idle until the initial proposal approval arrives; the later PR approval should finalize the already-reviewed lane without scheduling a fresh coder or reviewer pass.
