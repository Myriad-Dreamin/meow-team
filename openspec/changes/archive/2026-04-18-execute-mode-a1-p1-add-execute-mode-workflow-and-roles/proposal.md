## Why

The harness currently assumes every approved request enters the shared
coder/reviewer loop, which is a poor fit for requests that primarily generate
scripts, benchmarks, experiments, and collected data. Add an explicit
execute-mode workflow for `execution:`, `benchmark:`, and `experiment:` inputs
so the system can persist subtype-aware routing, consult the right operating
guide, and review validators plus collected data without leaking the prefix into
canonical request titles or breaking the existing unprefixed workflow. This
proposal is one candidate implementation for the request: add an execute mode
that routes approved work through executor and execution-reviewer roles with
subtype-aware guide lookup and data-validation review semantics.

## What Changes

- Introduce the
  `execute-mode-a1-p1-add-execute-mode-workflow-and-roles` OpenSpec change for
  proposal "Add execute-mode workflow and roles".
- Parse `execution:`, `benchmark:`, and `experiment:` request prefixes,
  normalize them into persisted assignment mode metadata, and strip the prefix
  from canonical request-title and branch-planning inputs.
- Add `lib/team/executing/*` as a mode-specific stage runtime for script and
  data collection work, while keeping `lib/team/coding/index.ts` as the public
  run coordinator and leaving ordinary unprefixed requests on the current
  coder/reviewer path.
- Add `executor` and `execution-reviewer` roles plus prompt wiring, subtype
  guide lookup for `docs/guide/{execution,benchmark,experiment}.md`, and an
  `AGENTS.md` fallback for repositories like this one that do not yet ship
  dedicated execute guides.
- Define the execution review artifact contract so scripts, validators, and
  summarized collected data remain reviewable even when raw data is ignored by
  git, then cover the routing, fallback, and regression path with focused docs
  and tests.

## Capabilities

### New Capabilities

- `execute-mode-a1-p1-add-execute-mode-workflow-and-roles`: Detect and persist
  execute-mode request prefixes, route approved execute assignments through
  executor and execution-reviewer stages with subtype-aware guide lookup, and
  preserve the existing unprefixed coder/reviewer workflow.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat(team/executing): introduce execute mode workflow`
- Conventional title metadata: `feat(team/executing)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected runtime areas: `lib/team/coding/*`, new `lib/team/executing/*`,
  `lib/team/roles/*`, `lib/team/history.ts`, `lib/team/types.ts`, focused
  workflow docs, and regression coverage for planning plus approval routing.
- Shared execution pool: proposal approval, pooled worker scheduling, and
  reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` stay in place;
  execute mode changes which stage modules and roles run after approval.
- Current repository note: `docs/guide/` is absent in this repository today, so
  the initial implementation must exercise the `AGENTS.md` fallback path for
  `execution`, `benchmark`, and `experiment` guidance.
- Planner deliverable: Proposal: `Add execute-mode workflow and roles`
  Objective: implement execute-mode request parsing for `execution:`,
  `benchmark:`, and `experiment:` inputs; persist the mode on approved
  assignments; route those assignments through new `lib/team/executing` stages
  with `executor` and `execution-reviewer` roles; require subtype-specific guide
  lookup with `AGENTS.md` fallback when guides are absent; and cover the
  script/data validation path with focused docs and regression tests while
  preserving the existing unprefixed coder/reviewer workflow.
