## Context

The current build output reports broad file-trace warnings in
`lib/storage/sqlite.ts`, `lib/team/logs.ts`, `lib/team/repositories.ts`, and
`lib/git/ops.ts`. In each case the traced server module resolves a
config-derived path by joining a dynamic string onto `process.cwd()` or
`worktreePath`, which makes Next.js treat the entire project tree as a
possible runtime dependency. `storage.threadFile` and configured repository
roots already originate from trusted configuration, so the current runtime
joins are duplicated late-bound work that broadens tracing without adding real
flexibility.

## Goals / Non-Goals

**Goals:**
- Normalize config-owned filesystem paths once at the configuration boundary so
  traced server modules can consume stable resolved values.
- Preserve current behavior for relative config inputs, absolute paths, and
  SQLite `:memory:` storage while removing broad dynamic joins from hot server
  helpers.
- Rebuild OpenSpec archive source and destination paths with explicit bounded
  segments so archive and retry flows remain trace-friendly.
- Add regression coverage around config parsing, storage and log resolution,
  repository discovery, and archive idempotency, then validate with the repo's
  required checks.

**Non-Goals:**
- Changing the configured workflow `planner -> coder -> reviewer`.
- Moving storage, logs, repositories, or archive outputs to new directories.
- Generalizing a new path utility for unrelated modules outside the reported
  warnings.
- Changing archive naming semantics beyond how the destination path is
  assembled.

## Decisions

1. Normalize config-owned paths in `defineTeamConfig` or an equivalent config
   boundary helper.
   Rationale: `storage.threadFile` and repository roots are configuration
   inputs, so resolving them once keeps downstream code deterministic and
   removes repeated `process.cwd()` joins from traced modules.
   Alternatives considered:
   - Keep resolving relative inputs inside each storage, log, and repository
     helper. Rejected because it preserves the warnings and duplicates the same
     runtime behavior in multiple traced files.
   - Normalize paths lazily in `lib/team/server-state.ts`. Rejected because
     repository listing and other config consumers would still need their own
     late-bound resolution.

2. Treat storage, log, and repository helpers as consumers of normalized
   inputs.
   Rationale: once config owns relative-path resolution, `lib/storage/sqlite.ts`
   can focus on `.sqlite` and `.json` sibling derivation, `lib/team/logs.ts`
   can derive `codex-logs` beside the resolved thread store, and
   `lib/team/repositories.ts` can list repositories from resolved roots without
   re-anchoring to the project root.
   Alternatives considered:
   - Preserve helper-level fallback joins for relative strings. Rejected
     because it keeps the tracing pattern broad and obscures the intended
     contract that config-owned paths should already be resolved.

3. Assemble OpenSpec archive paths through explicit source and archive
   branches.
   Rationale: the source path always lives under `openspec/changes/<change>`
   and the default archive path always lives under
   `openspec/changes/archive/<date-change>`, so building each branch from fixed
   segments keeps tracing bounded while preserving reuse of an existing archive
   directory.
   Alternatives considered:
   - Continue joining `worktreePath` with an arbitrary `archiveRelativePath`.
     Rejected because the dynamic second segment is the direct source of the
     trace warning.
   - Flatten archive handling into string concatenation without branch
     distinction. Rejected because it would make conflict and idempotency
     checks harder to reason about.

4. Lock the refactor with focused regression tests before relying on build
   output alone.
   Rationale: the highest risk is an accidental contract change for callers
   that still expect relative paths to work, so tests need to prove that
   config-level normalization preserves existing behavior while the downstream
   helpers stay bounded.
   Alternatives considered:
   - Rely only on `pnpm build` to confirm the warnings disappear. Rejected
     because that would not prove repository, log, or archive behavior stayed
     correct.

## Conventional Title

- Canonical request/PR title: `fix: narrow server file tracing paths`
- Conventional title metadata: `fix`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Hidden relative-path callers bypass config normalization] -> Audit affected
  call sites during implementation review and add tests that prove the intended
  config-owned contract.
- [Normalization timing changes the effective working directory anchor] ->
  Resolve paths at a deterministic config boundary and preserve absolute-input
  pass-through behavior.
- [Archive path refactor regresses idempotent retries or conflict detection] ->
  Keep the existing archive-state tests and extend them to cover explicit
  branch assembly.
- [Repository listing subtly changes on symlinked or missing roots] -> Reuse
  the current accessibility and containment checks after the root path is
  normalized.

## Migration Plan

- Introduce config-boundary normalization for `storage.threadFile` and
  repository roots without changing the external config shape.
- Update traced helpers to consume normalized values and land regression tests
  alongside the refactor.
- Rollback remains straightforward: restore helper-level joins if hidden
  callers surface during review, while keeping the new tests to identify the
  incompatible path contract.

## Open Questions

- Do any callers outside `teamConfig` intentionally pass relative `threadFile`
  or repository root strings directly into the affected helpers? Implementation
  should verify this during review and either normalize those callers or make
  the remaining contract explicit.
