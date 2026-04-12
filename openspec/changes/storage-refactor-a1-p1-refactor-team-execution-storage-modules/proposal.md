## Why

Create the OpenSpec-backed change `refactor-team-execution-storage` to move `lib/team/storage.ts` into `lib/storage/`, split generic SQLite setup from thread-specific persistence APIs, update affected runtime imports, and convert team execution tests to SQLite-backed fixtures while preserving explicit coverage for legacy JSON import behavior. Single proposal: refactor team execution storage into `lib/storage` and migrate legacy JSON-seeded team execution tests to SQLite-backed setup. This proposal is one candidate implementation for the request: Extend storage for team execution: - `await writeThreadStore(createLane());` in `dispatch-approval.test.ts` still uses json store. - similarly, there are other legacy code in `history.test.ts` - move `lib/team/storage.ts` to `lib/storage/` - split `storage.ts` into general sqlite setup and concepts like `lib/storage/thread.ts`.

## What Changes

- Introduce the `storage-refactor-a1-p1-refactor-team-execution-storage-modules` OpenSpec change for proposal "Refactor team execution storage modules".
- Create the OpenSpec-backed change `refactor-team-execution-storage` to move `lib/team/storage.ts` into `lib/storage/`, split generic SQLite setup from thread-specific persistence APIs, update affected runtime imports, and convert team execution tests to SQLite-backed fixtures while preserving explicit coverage for legacy JSON import behavior.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `storage-refactor-a1-p1-refactor-team-execution-storage-modules`: Create the OpenSpec-backed change `refactor-team-execution-storage` to move `lib/team/storage.ts` into `lib/storage/`, split generic SQLite setup from thread-specific persistence APIs, update affected runtime imports, and convert team execution tests to SQLite-backed fixtures while preserving explicit coverage for legacy JSON import behavior.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `refactor(team/storage): Refactor team execution storage modules`
- Conventional title metadata: `refactor(team/storage)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal 1: Refactor Team Execution Storage Modules Change slug: `refactor-team-execution-storage` Why: the SQLite backend already exists, but team execution storage is still organized under `lib/team/storage.ts` and several tests still seed legacy JSON stores, which means structure and test setup lag behind the runtime model. Execution plan: - Extract shared SQLite concerns into `lib/storage`. - Isolate thread-domain behavior in `lib/storage/thread.ts`. - Repoint runtime imports away from `lib/team/storage.ts`. - Replace JSON-seeded fixtures in `dispatch-approval.test.ts` and the non-import paths in `history.test.ts` with SQLite-backed helpers. - Preserve one explicit legacy JSON import test so backward compatibility remains covered. Approval risks: - Connection caching and serialized writes must remain stable after the split. - The refactor should not silently drop legacy import coverage or change thread normalization behavior. - Structural import changes should be validated with the standard repo checks before merge. Coding-review lanes remain idle until human approval.
