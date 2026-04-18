## Context

This change captures proposal "Add execute-mode workflow and roles" as OpenSpec
change `execute-mode-a1-p1-add-execute-mode-workflow-and-roles`.
Implementation starts only after human approval and is claimed by the next
available pooled worker from the shared worktree pool.

Today `lib/team/coding/index.ts` owns the public run-state coordinator and
dispatches planning, coding, reviewing, and archiving stages using assignment
records from `lib/team/history.ts` plus role dependencies from
`lib/team/roles/dependencies.ts`. Request metadata currently tracks titles,
conventional-title metadata, branch prefixes, and lane state, but it does not
persist an assignment mode that can distinguish normal implementation work from
script-and-data execution work. The repository also does not currently ship a
`docs/guide/` tree, so execute-mode prompts need a deterministic `AGENTS.md`
fallback for subtype guidance.

## Goals / Non-Goals

**Goals:**

- Detect `execution:`, `benchmark:`, and `experiment:` prefixes during planning,
  store the normalized execute subtype on the assignment, and keep canonical
  request-title generation independent from the prefix text.
- Route approved execute-mode assignments through `lib/team/executing/*` with
  `executor` and `execution-reviewer` roles while leaving ordinary unprefixed
  requests on the current coder/reviewer path.
- Keep `lib/team/coding/index.ts` as the public run coordinator and avoid
  introducing a second top-level runtime API.
- Require subtype-specific guide lookup from `docs/guide/<mode>.md` with an
  explicit `AGENTS.md` fallback when guides are absent.
- Define a review contract for scripts, validators, and summarized collected
  data so execution-review can validate correctness even when raw data stays
  ignored by git.
- Update docs, activity strings, and regression coverage so execute-mode
  behavior is visible without regressing the current workflow.

**Non-Goals:**

- Generalize the harness into arbitrary workflow composition in this change.
- Change planner approval timing, pooled scheduling rules, or branch/worktree
  allocation semantics before human approval.
- Replace the default unprefixed `planner -> coder -> reviewer` workflow.
- Require raw benchmark or experiment output to be committed when validators and
  summarized data artifacts are sufficient for review.

## Decisions

- Persist execute mode as explicit assignment metadata, not implicit prompt
  state. Planning will parse the request prefix once, normalize it to one of
  `execution`, `benchmark`, or `experiment`, strip the prefix from canonical
  title inputs, and store the mode on the assignment so approval, resumed
  dispatch, and archive handling can branch deterministically without leaking
  the prefix into canonical request titles.
- Keep `lib/team/coding/index.ts` as the single public coordinator and branch
  internally by mode. The coordinator will continue to own planning,
  approval-command entrypoints, and persisted run-state transitions, but
  approved execute-mode lanes will call into new `lib/team/executing/*` stage
  handlers instead of the existing coding/reviewing modules. This preserves the
  current external API while containing the new behavior to mode-aware routing.
- Mirror the current stage layout under `lib/team/executing/` before
  specializing behavior. The user request explicitly prefers copying
  `lib/team/coding` into a new runtime rather than forcing early abstraction, so
  the first implementation should create peer stage modules for execution,
  review, archiving, shared helpers, and worktree interactions, then adapt the
  copied flow for script/data semantics.
- Extend the role dependency graph with execute-mode agents. Add
  `executor` and `execution-reviewer` prompt files plus matching role modules,
  sync prompt types, and teach `resolveTeamRoleDependencies` to construct both
  the existing coder/reviewer agents and the new execute-mode agents from the
  shared queued executor.
- Centralize subtype guide resolution. A small helper should resolve
  `docs/guide/execution.md`, `docs/guide/benchmark.md`, or
  `docs/guide/experiment.md` from the repository worktree and, when absent,
  switch prompt instructions to `AGENTS.md` notes for that subtype. The
  resolved path and fallback status should be passed into executor and
  execution-reviewer prompts so the agents do not make ad hoc assumptions.
- Treat validator-backed script/data review as the execute-mode approval
  contract. Execute lanes must produce committed script changes plus either a
  committed validator or a reproducible validation command and a reviewable
  summary of collected data paths or results. The execution-reviewer approves
  only when the script, validator path, and data summary align; otherwise it
  records a `needs_revision` handoff with a concrete validator or todo artifact.
- Preserve existing UI and storage assumptions through explicit metadata rather
  than new counters. Current lane statuses and execution phases already drive
  the UI and persistence model, so this change should add explicit mode metadata
  and mode-aware activity text instead of introducing separate execute-only lane
  status enums unless a later request requires them.

## Conventional Title

- Canonical request/PR title: `feat(team/executing): introduce execute mode workflow`
- Conventional title metadata: `feat(team/executing)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Workflow drift between `coding` and `executing`] -> Copy the current coding
  layout first, then add focused routing and regression tests so future changes
  can compare both paths explicitly.
- [Prefix leakage into canonical titles or branch names] -> Normalize request
  mode before request-title generation and store execute mode separately from
  canonical title metadata.
- [Guide lookup ambiguity] -> Centralize guide resolution and test both the
  guide-present and `AGENTS.md` fallback paths. This repository currently needs
  the fallback path because `docs/guide/` is absent.
- [Reviewer cannot assess gitignored data] -> Require validator-backed commands
  and committed summary artifacts so review can confirm correctness without
  storing raw data in git.
- [UI or resume-path regressions] -> Keep current coordinator and lane statuses,
  add explicit mode metadata defaults for historical assignments, and cover
  resumed approval/review transitions in regression tests.

## Migration Plan

- Add nullable or defaulted execute-mode fields to persisted assignment state
  and normalize missing historical values to the existing coder/reviewer mode.
- Land the new role prompts, synced prompt types, and dependency wiring before
  enabling mode-based approval routing so resumed lanes can resolve either role
  set safely.
- Update roadmap or workflow docs, activity strings, and regression tests in
  the same change so the documented coordinator and behavior stay aligned with
  the shipped runtime.

## Open Questions

- No approval-blocking open questions remain for this proposal scope. Distinct
  execute-mode UI counters or broader workflow composition can be proposed
  later if the explicit mode metadata is not sufficient.
