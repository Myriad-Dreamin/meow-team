## Context

This change captures proposal "Introduce SQLite Storage Module" as OpenSpec change `sqlite-storage-a2-p1-introduce-sqlite-storage-module`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Replace the JSON-backed team thread store with a server-only official `node:sqlite` storage module using handwritten parameterized SQL, preserve existing history behavior and stored data through a pragmatic migration path, document metadata/migrations/security/performance in `docs/storage.md`, and verify schema migration behavior with SQLite tests that use `:memory:`.
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
- Keep the canonical request/PR title as `feat(storage): Introduce SQLite Storage Module`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `feat(storage)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `feat(storage): Introduce SQLite Storage Module`
- Conventional title metadata: `feat(storage)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal 1: Introduce SQLite Storage Module. Build a server-only storage layer on official `node:sqlite` with handwritten parameterized SQL, schema metadata, and ordered migrations; preserve the current history API while moving persistence off the JSON store; keep existing local thread history usable through a pragmatic migration/import path; document metadata, migration, SQL security, performance, and test usage in `docs/storage.md`; and verify fresh bootstrapping plus migration sequencing with `:memory:` SQLite tests. Approval risk to watch first: the repo currently targets Node 20 in `package.json` and CI, while official `node:sqlite` requires aligning runtime expectations to a newer Node floor (see https://nodejs.org/api/sqlite.html). Coding-review lanes should stay idle until this single proposal is approved.
