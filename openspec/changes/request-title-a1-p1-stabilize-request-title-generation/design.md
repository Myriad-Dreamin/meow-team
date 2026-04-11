## Context

This change captures proposal "Stabilize request title generation" as OpenSpec change `request-title-a1-p1-stabilize-request-title-generation`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Generate request titles during initial metadata resolution, preserve them through planning, and normalize conventional-prefixed subjects to lowercased, non-duplicated wording.
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
- Keep the canonical request/PR title as `fix: Stabilize request title generation`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `fix` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `fix: Stabilize request title generation`
- Conventional title metadata: `fix`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Implement one OpenSpec-aligned change for request-title generation. Proposal: Stabilize request title generation. Objective: move plain title generation into `resolveRequestMetadata`, keep post-planning work focused on conventional metadata enrichment and canonical assembly, and correct prefixed subject formatting. Implementation boundaries: - Adjust the network metadata flow so planner runs with the generated request title already present. - Preserve manual and persisted title precedence, along with the existing deterministic fallback path. - Add regression tests for lowercase prefixed subjects, duplicated leading conventional verbs, and the updated request-title/planner sequencing. Open risk: shared conventional-title helpers also feed lane PR titles, so the coder should verify whether the normalization belongs in the shared formatter or only in canonical request-title generation. Approval note: keep coder and reviewer lanes idle until owner approval.
