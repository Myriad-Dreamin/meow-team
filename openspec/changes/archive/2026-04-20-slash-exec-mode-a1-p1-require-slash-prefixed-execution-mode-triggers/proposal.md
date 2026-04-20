## Why

Execution-mode detection currently depends on colon-prefixed tokens such as `execution:` and can autocomplete mode names outside the canonical command position. Tightening both parser and autocomplete behavior to slash-prefixed commands at the start of request content removes ambiguous matches, aligns the editor with the intended command contract, and keeps downstream execution-mode routing deterministic.

## What Changes

- Introduce the `slash-exec-mode-a1-p1-require-slash-prefixed-execution-mode-triggers` OpenSpec change for proposal "Require slash-prefixed execution mode triggers".
- Replace the current colon-prefixed execution-mode trigger contract with slash-prefixed start-of-request matching for `/execution `, `/benchmark `, and `/experiment ` after any leading whitespace.
- Preserve the existing normalization behavior that strips a valid execution-mode token from the request text once the mode has been detected.
- Limit execution-mode autocomplete to slash input at the beginning of request content and stop suggesting completions for bare `execution`, `benchmark`, or `experiment` text.
- Refresh parser and autocomplete regression coverage in `lib/team/execution-mode.test.ts` around the new positive and negative cases.

## Capabilities

### New Capabilities

- `slash-exec-mode-a1-p1-require-slash-prefixed-execution-mode-triggers`: Define the approved slash-prefixed parsing and autocomplete contract for execution-mode requests and keep the resulting request normalization and planner handoff behavior stable.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `fix(execution-mode): Require slash execution triggers`
- Conventional title metadata: `fix(execution-mode)`
- The proposal title remains `Require slash-prefixed execution mode triggers` without changing the OpenSpec change name or path.

## Impact

- Affected repository: `meow-team`
- Affected code: `lib/team/execution-mode.ts`, `lib/team/execution-mode.test.ts`, and `lib/team/coding/plan.ts` as a downstream consumer of normalized execution-mode input
- UX impact: request editor autocomplete only activates for slash-prefixed execution-mode commands typed at request start
- Planner deliverable: Single OpenSpec-aligned proposal because the requested behavior is narrow and centered on one shared parsing and autocomplete contract.
