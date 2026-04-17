## Why

Next.js build tracing is reporting overly broad file patterns because traced
server helpers resolve config-relative storage, log, repository, and OpenSpec
archive paths by joining dynamic values onto `process.cwd()` or a worktree
root at runtime. Narrowing that path resolution now removes a build
performance and over-bundling risk that currently affects app routes, server
components, and proposal finalization flows.

## What Changes

- Introduce the `trace-paths-a1-p1-narrow-server-file-tracing-path-resolution`
  OpenSpec change for proposal "Narrow server file tracing path resolution".
- Normalize config-owned filesystem paths once so `storage.threadFile` and
  configured repository roots reach traced server helpers as already-resolved
  values while preserving absolute-path support and current relative-config
  behavior.
- Remove broad dynamic joins from `lib/storage/sqlite.ts`,
  `lib/team/logs.ts`, and `lib/team/repositories.ts` so those modules only
  derive bounded sibling paths from normalized inputs.
- Rewrite OpenSpec archive path assembly in `lib/git/ops.ts` to use explicit
  `openspec/changes/...` branches and fixed archive segments instead of
  joining an unbounded relative archive path onto `worktreePath`.
- Add regression coverage for config parsing, storage and log path resolution,
  repository discovery, and OpenSpec archive handling, then validate with
  `pnpm fmt`, `pnpm lint`, relevant Vitest coverage, and `pnpm build`.
- Keep the proposal logically scoped so any approved coding-review worker can
  claim it without replanning.

## Capabilities

### New Capabilities
- `trace-paths-a1-p1-narrow-server-file-tracing-path-resolution`: Normalize
  config-owned filesystem paths before traced server helpers run, remove broad
  runtime path joins from storage, logs, repositories, and OpenSpec archive
  handling, and lock the refactor in with regression coverage and validation.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `fix: narrow server file tracing paths`
- Conventional title metadata: `fix`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected code: `lib/config/team.ts`, `lib/storage/sqlite.ts`,
  `lib/team/logs.ts`, `lib/team/repositories.ts`, `lib/git/ops.ts`, and the
  corresponding regression tests
- Coding-review execution: pooled workers with reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal 1. Objective: normalize config-owned
  filesystem paths early, remove broad build-trace patterns from traced server
  modules, rewrite OpenSpec archive path assembly with explicit bounded
  segments, and validate the behavior with formatting, lint, targeted Vitest
  coverage, and a production build. Approval considerations: keep relative
  config compatibility intact, watch for hidden relative-path callers outside
  config parsing, and keep coder and reviewer lanes idle until human approval.
