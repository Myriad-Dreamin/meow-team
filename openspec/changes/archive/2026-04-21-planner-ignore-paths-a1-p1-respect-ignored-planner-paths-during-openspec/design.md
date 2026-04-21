## Context

This change captures proposal "Respect ignored planner paths during OpenSpec
materialization" as OpenSpec change
`planner-ignore-paths-a1-p1-respect-ignored-planner-paths-during-openspec`.
Today `assertProposalChangeDeltaIsIsolated()` rejects every changed path
outside `proposalPath`, even if the repository already ignores that path. The
reported planner failure against `.codex` is a false positive because
`.gitignore` already excludes `.codex/*`, but the current validation never
consults ignore rules.

Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Make planner materialization ignore validation respect repository
  `.gitignore` rules for paths outside the proposal directory.
- Keep the current failure mode and error reporting for unrelated paths that are
  not ignored.
- Add explicit `ignore` dependency coverage and regression tests for both the
  ignored `.codex` case and the non-ignored `README.md` case.
- Preserve the canonical request/PR title
  `fix(openspec/planner): honor ignored planner paths` and conventional-title
  metadata `fix(openspec/planner)` across the materialized artifacts.

**Non-Goals:**
- Broaden planner validation beyond the OpenSpec materialization path in
  `lib/team/openspec.ts`.
- Weaken existing artifact existence, prior snapshot, or planner HEAD stability
  checks.
- Introduce per-path allowlists such as a hardcoded `.codex` exception.

## Decisions

- Use the `ignore` package as a direct dependency and load the repository root
  `.gitignore` from the planner materialization flow before asserting the path
  delta. Alternative considered: call `git check-ignore` or maintain a
  hardcoded `.codex` allowlist. `ignore` keeps the logic in-process, testable,
  and aligned with repository rules instead of one-off exceptions.
- Apply ignore matching only to unexpected paths outside `proposalPath` after
  the delta has been computed. Alternative considered: filter every changed path
  before delta analysis. Keeping the filter at the unexpected-path step
  preserves existing proposal artifact validation and prior snapshot protection.
- Normalize changed paths to repository-relative POSIX paths before matching
  ignore rules. Alternative considered: feed raw filesystem paths into the
  matcher. Reusing the existing normalized path representation avoids
  OS-specific mismatches and keeps error reporting stable.
- Add paired regression coverage in `lib/team/openspec.test.ts` for an ignored
  `.codex` byproduct that no longer fails and a `README.md` change that still
  throws the outside-path error. Alternative considered: only test the happy
  path. Explicit paired tests protect against both false positives and
  accidental over-filtering.

## Conventional Title

- Canonical request/PR title:
  `fix(openspec/planner): honor ignored planner paths`
- Conventional title metadata: `fix(openspec/planner)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Ignore matching and git path normalization diverge] -> Match against the
  same repository-relative normalized paths already used for planner delta
  reporting.
- [Ignored-path filtering becomes too broad] -> Only suppress paths that the
  repository ignore matcher reports as ignored; keep every other unexpected path
  fatal.
- [Dependency already exists only transitively] -> Declare `ignore` directly in
  `package.json` and refresh `pnpm-lock.yaml` so the planner logic has an
  explicit contract.
- [Future nested ignore sources behave differently] -> Scope this change to the
  repository `.gitignore` rules needed for the known `.codex` regression before
  broadening planner validation further.

## Migration Plan

No user-facing migration is required. The change is internal to planner
proposal materialization and rolls out with the dependency update plus
regression coverage.

## Open Questions

- None.
