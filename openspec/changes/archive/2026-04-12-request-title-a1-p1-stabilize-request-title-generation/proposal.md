## Why

Generate request titles during initial metadata resolution, preserve them through planning, and normalize conventional-prefixed subjects to lowercased, non-duplicated wording. Fix request-title timing and conventional-prefix subject formatting. This proposal is one candidate implementation for the request: Fix minor issues about request title generation: - the request title must be lowercased when the scope is prefixed: "feat(lane/commits): Link lane commit activity to GitHub" - the title has duplicated verb when the scope is prefixed with verb: "refactor(team/runteam): refactor `runTeam` into a persisted stage machine" - the request title should be generated on `resolveRequestMetadata` rather than after planning.

## What Changes

- Introduce the `request-title-a1-p1-stabilize-request-title-generation` OpenSpec change for proposal "Stabilize request title generation".
- Generate request titles during initial metadata resolution, preserve them through planning, and normalize conventional-prefixed subjects to lowercased, non-duplicated wording.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `request-title-a1-p1-stabilize-request-title-generation`: Generate request titles during initial metadata resolution, preserve them through planning, and normalize conventional-prefixed subjects to lowercased, non-duplicated wording.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `fix: Stabilize request title generation`
- Conventional title metadata: `fix`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Implement one OpenSpec-aligned change for request-title generation. Proposal: Stabilize request title generation. Objective: move plain title generation into `resolveRequestMetadata`, keep post-planning work focused on conventional metadata enrichment and canonical assembly, and correct prefixed subject formatting. Implementation boundaries: - Adjust the network metadata flow so planner runs with the generated request title already present. - Preserve manual and persisted title precedence, along with the existing deterministic fallback path. - Add regression tests for lowercase prefixed subjects, duplicated leading conventional verbs, and the updated request-title/planner sequencing. Open risk: shared conventional-title helpers also feed lane PR titles, so the coder should verify whether the normalization belongs in the shared formatter or only in canonical request-title generation. Approval note: keep coder and reviewer lanes idle until owner approval.
