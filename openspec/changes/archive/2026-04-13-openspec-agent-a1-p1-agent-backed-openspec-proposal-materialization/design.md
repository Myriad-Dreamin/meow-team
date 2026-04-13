## Context

This change captures proposal "Agent-backed OpenSpec proposal materialization" as OpenSpec change `openspec-agent-a1-p1-agent-backed-openspec-proposal-materialization`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Replace hardcoded markdown generation in lib/team/openspec.ts with a dedicated Codex/OpenSpec artifact agent, preserve the current proposal dispatch and approval flow, and add regression coverage for artifact creation and failure handling.
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
- Keep the canonical request/PR title as `feat(oht/workflow): Agent-backed OpenSpec proposal materialization`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `feat(oht/workflow)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `feat(oht/workflow): Agent-backed OpenSpec proposal materialization`
- Conventional title metadata: `feat(oht/workflow)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal 1 is the preferred path. Objective: Replace the hardcoded markdown builders in lib/team/openspec.ts with a dedicated agent-backed OpenSpec materializer that uses the local OpenSpec skill workflow while keeping the existing planner dispatch lifecycle stable. Execution outline: 1. Add a new structured agent/helper for OpenSpec proposal materialization, following the same invocation pattern used by existing role helpers. 2. Pass proposal metadata into that agent from the planner materialization path so the agent writes the OpenSpec artifacts in the planner worktree instead of relying on inline string templates. 3. Keep existing change creation, worktree management, commit creation, and branch ref updates unchanged except for the artifact-generation step. 4. Add tests for dependency registration, prompt/invocation orchestration, and error paths when artifact generation does not leave the expected OpenSpec files on disk. Approval notes: - This is a single refactor proposal; there is no separate proposal worth scheduling independently. - Coding and review lanes should remain idle until a human approves this proposal.
