## Context

This change captures proposal "Add Roadmap Concept and Archive Linking" as OpenSpec change `roadmap-concept-a1-p1-add-roadmap-concept-and-archive-linking`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Introduce the `docs/roadmap` structure, a repo-local roadmap skill with alias-aware guidance, docs navigation updates, and deterministic final-archive updates that append archived OpenSpec spec links into the matching roadmap topic's `## Related Specs` section.
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
- Keep the canonical request/PR title as `feat(roadmap): Add Roadmap Concept and Archive Linking`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `feat(roadmap)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `feat(roadmap): Add Roadmap Concept and Archive Linking`
- Conventional title metadata: `feat(roadmap)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Single OpenSpec-aligned proposal. Suggested OpenSpec seed: roadmap-concept. Implement a repository roadmap system rooted at `docs/roadmap/index.md`, create per-roadmap and per-topic markdown files with optional alias support, add a repo-local roadmap skill for agent-authored updates, expose that skill in harness prompt context, and wire final OpenSpec archival to append the archived change name as a `## Related Specs` link in the resolved roadmap topic. Reuse the existing slash-delimited conventional title scope as the deterministic roadmap/topic locator, keep it out of branch prefixes and OpenSpec change paths, and cover alias resolution plus archive-update failure modes with tests. Coding-review lanes remain idle until this proposal is approved.
