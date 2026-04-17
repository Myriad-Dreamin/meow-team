## Context

This change captures proposal "Standardize Conventional Commit Prefixes" as
OpenSpec change
`commit-prefixes-a1-p1-standardize-conventional-commit-prefixes`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

The repository already standardizes request and PR titles around explicit
conventional-title metadata, but planner proposal materialization commits still
use `planner:` in `lib/team/openspec.ts` and coder auto-commits still use
`coder:` in `lib/team/coding/reviewing.ts`. This change introduces one shared,
deterministic commit-subject contract for harness-managed commits and any
direct `git commit` commands authored by coder or reviewer lanes.

## Goals / Non-Goals

**Goals:**

- Add a shared commit-message formatter or classifier that only emits
  `docs:`, `dev:`, `fix:`, and `test:` prefixes in lowercase conventional
  format.
- Keep commit-prefix selection deterministic and default ambiguous internal
  work to `dev:`.
- Route planner proposal materialization commits to `docs:` and align coder,
  repair, test-only, and archive flows with the same mapping contract.
- Update coder and reviewer prompt guidance so direct commits follow the same
  policy as harness-managed commits.
- Add regression coverage for proposal materialization plus coding and archive
  commit flows without changing branch or PR title behavior.
- Preserve the canonical request/PR title
  `dev(harness/commits): standardize harness commit prefixes` and conventional
  title metadata `dev(harness/commits)` throughout the materialized artifacts.

**Non-Goals:**

- Change request-title or PR-title behavior beyond any small helper extraction
  needed to avoid duplicated conventional-formatting logic.
- Add commitlint, git hooks, or new conventional types beyond `dev`, `docs`,
  `fix`, and `test`.
- Infer commit type from changed files, diffs, or prompt-only heuristics.
- Re-plan or activate coding-review lanes before human approval.

## Decisions

- Centralize harness-managed commit subject formatting in a shared helper that
  accepts explicit intent or context and returns `<type>: <summary>` in
  lowercase conventional format. Alternative: keep separate string builders in
  planner and coder flows. Rejected because duplicated logic would drift across
  proposal, coding, repair, and archive call sites.
- Map planner proposal materialization plus proposal, archive, and
  documentation-oriented commits to `docs:` because those flows primarily write
  or move OpenSpec and documentation artifacts. Alternative: treat all
  automation as `dev:`. Rejected because proposal and archive history would
  stay indistinguishable from implementation commits.
- Map repair-oriented runs to `fix:` and reserve `test:` for explicit
  test-focused work. All other implementation work falls back to `dev:`.
  Alternative: inspect diffs and classify by touched files. Rejected because
  file-based guessing is not deterministic and would overclassify ordinary code
  changes that also touch tests.
- Update coder and reviewer prompt text to reference the same four-prefix
  policy for any direct `git commit` commands. Alternative: only standardize
  automated commits. Rejected because agents can still author direct commits in
  exceptional flows, and that guidance must stay consistent with automation.
- Extend regression coverage at both the shared-helper layer and the current
  commit call sites, especially `lib/git/ops-materialization.test.ts`,
  `lib/team/openspec.test.ts`, and `lib/team/coding/index.test.ts`, so the new
  mapping stays stable across proposal materialization, implementation, repair,
  test-only, and archive flows.

## Conventional Title

- Canonical request/PR title:
  `dev(harness/commits): standardize harness commit prefixes`
- Conventional title metadata: `dev(harness/commits)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Ambiguous work intent] -> Require explicit classification inputs where
  available and fall back to `dev:` whenever the operation is not clearly
  documentation, repair, or explicit test-only work.
- [Overusing `test:`] -> Reserve `test:` for explicit test-only instructions or
  test-focused runs rather than any implementation that happens to touch tests.
- [Prompt and runtime drift] -> Keep prompt guidance limited to the same
  four-prefix contract and cover runtime call sites with targeted regression
  tests.
- [Archive classification surprise] -> Document that archive-time proposal and
  spec updates use `docs:` because they primarily move or update OpenSpec
  artifacts rather than introduce new implementation behavior.

## Migration Plan

- Land the shared formatter and both planner and coder call-site updates in the
  same change so newly generated commits start using conventional prefixes
  immediately after rollout.
- Leave existing historical `planner:` and `coder:` commits unchanged; no data
  migration is required.
- Roll back by reverting the shared formatter, call-site wiring, and prompt
  guidance together if a downstream workflow depends on the legacy prefixes.

## Open Questions

- None.
