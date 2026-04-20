## Context

This change captures proposal "Require slash-prefixed execution mode triggers" as OpenSpec change `slash-exec-mode-a1-p1-require-slash-prefixed-execution-mode-triggers`. The current execution-mode parser and autocomplete logic accept colon-prefixed mode markers and mode-name prefixes more broadly than the requested contract, so the planner needs a tighter shared rule before coding begins.

## Goals / Non-Goals

**Goals:**

- Update `lib/team/execution-mode.ts` so execution modes are recognized only from `/execution `, `/benchmark `, or `/experiment ` at the start of request content after optional leading whitespace.
- Preserve downstream behavior that strips a valid slash-prefixed mode token from normalized request text while keeping persisted mode metadata unchanged.
- Restrict autocomplete so it only proposes slash-prefixed execution-mode commands when the user is typing at request start.
- Refresh tests to lock in the new parser and autocomplete contract, including negative cases for mid-sentence and bare-word input.
- Keep the canonical request/PR title as `fix(execution-mode): Require slash execution triggers` and preserve conventional-title metadata `fix(execution-mode)` in the materialized artifacts.

**Non-Goals:**

- Introduce broader slash-command routing beyond execution-mode parsing and autocomplete.
- Change execution-mode names, downstream role routing, or planner dispatch behavior after a valid mode has already been detected.
- Add editor behaviors for slash commands beyond the existing execution-mode suggestion shape.

## Decisions

- Treat a leading slash command plus trailing space as the only valid execution-mode trigger so parsing and autocomplete share one canonical contract.
- Allow leading whitespace before the slash trigger to preserve current start-of-request ergonomics while still rejecting mid-sentence activation.
- Keep normalized request text stripping behavior unchanged after a valid match so `lib/team/coding/plan.ts` and later stages continue consuming the same request body shape.
- Update autocomplete labels and insert text to slash-prefixed forms while preserving the existing suggestion payload structure consumed by the editor.
- Materialize this work as one proposal because the parser, normalization, and autocomplete changes share one review boundary.

## Risks / Trade-offs

- [Downstream normalization regressions] -> Re-run parser tests against `parseExecutionModeInput` cases that feed `lib/team/coding/plan.ts`.
- [Autocomplete over-restriction] -> Cover leading-whitespace and partial-slash inputs so valid start-of-request suggestions still appear.
- [Behavior mismatch between parser and autocomplete] -> Treat both behaviors as one contract in shared tests and review them together.
- [Scope creep into generic slash commands] -> Keep the change limited to execution-mode definitions and their existing autocomplete surface.

## Conventional Title

- Canonical request/PR title: `fix(execution-mode): Require slash execution triggers`
- Conventional title metadata: `fix(execution-mode)`
- The proposal title remains `Require slash-prefixed execution mode triggers` without changing the OpenSpec change name or path.
