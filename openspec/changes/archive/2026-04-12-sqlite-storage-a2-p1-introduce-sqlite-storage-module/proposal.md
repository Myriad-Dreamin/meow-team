## Why

Replace the JSON-backed team thread store with a server-only official `node:sqlite` storage module using handwritten parameterized SQL, preserve existing history behavior and stored data through a pragmatic migration path, document metadata/migrations/security/performance in `docs/storage.md`, and verify schema migration behavior with SQLite tests that use `:memory:`. Single proposal to replace the JSON thread store with official `node:sqlite`, document storage design and usage, and cover schema/data migration behavior with SQLite-backed tests. This proposal is one candidate implementation for the request: introduce storage module: - add sqlite library, and plain sql argument construction is preferred. - document in `docs/storage.md` about the design and usage of storage module: metadata and migration, sql security, and performance. perform web search if necessary. - a memory sqlite is used for testing and test that design of migration works.

## What Changes

- Introduce the `sqlite-storage-a2-p1-introduce-sqlite-storage-module` OpenSpec change for proposal "Introduce SQLite Storage Module".
- Replace the JSON-backed team thread store with a server-only official `node:sqlite` storage module using handwritten parameterized SQL, preserve existing history behavior and stored data through a pragmatic migration path, document metadata/migrations/security/performance in `docs/storage.md`, and verify schema migration behavior with SQLite tests that use `:memory:`.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `sqlite-storage-a2-p1-introduce-sqlite-storage-module`: Replace the JSON-backed team thread store with a server-only official `node:sqlite` storage module using handwritten parameterized SQL, preserve existing history behavior and stored data through a pragmatic migration path, document metadata/migrations/security/performance in `docs/storage.md`, and verify schema migration behavior with SQLite tests that use `:memory:`.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `feat(storage): Introduce SQLite Storage Module`
- Conventional title metadata: `feat(storage)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal 1: Introduce SQLite Storage Module. Build a server-only storage layer on official `node:sqlite` with handwritten parameterized SQL, schema metadata, and ordered migrations; preserve the current history API while moving persistence off the JSON store; keep existing local thread history usable through a pragmatic migration/import path; document metadata, migration, SQL security, performance, and test usage in `docs/storage.md`; and verify fresh bootstrapping plus migration sequencing with `:memory:` SQLite tests. Approval risk to watch first: the repo currently targets Node 20 in `package.json` and CI, while official `node:sqlite` requires aligning runtime expectations to a newer Node floor (see https://nodejs.org/api/sqlite.html). Coding-review lanes should stay idle until this single proposal is approved.
