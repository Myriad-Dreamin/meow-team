## Context

`components/team-console.tsx` still renders the Continuous Assignment Console
`Request` field as a plain `<textarea>`, while
`components/thread-command-editor.tsx` already contains a proven client-only
CodeMirror integration with placeholder handling, ARIA synchronization,
loading or error fallback, and hint rendering. The planner pipeline also
parses execution-mode prefixes through `lib/team/execution-mode.ts`, but the
implementation currently expects slash-prefixed forms even though the approved
execute-mode spec and the existing Vitest expectations use colon-prefixed
forms such as `benchmark:`.

This proposal stays intentionally narrow: upgrade only the team request field
to a CodeMirror editor, preserve the current request lifecycle in
`TeamConsole`, and make execution-mode autocomplete read from the same
canonical prefix metadata that planner parsing uses.

## Goals / Non-Goals

**Goals:**

- Replace the `Request` textarea with a CodeMirror editor without changing the
  existing `prompt` state ownership in `TeamConsole`.
- Preserve form submission, whitespace trimming, branch deletion rerun, and
  disabled or busy gating behavior while swapping only the editing surface.
- Share execution-mode prefix metadata between parser logic and request-editor
  autocomplete so the UI suggests only accepted prefixes.
- Normalize the current parser contract to the approved colon-prefixed
  `execution:`, `benchmark:`, and `experiment:` syntax.
- Add focused coverage for the request editor and the currently failing
  execution-mode parser expectations.

**Non-Goals:**

- Redesign the broader Continuous Assignment Console layout or change the
  request title, thread, repository, or reset controls.
- Introduce a new backend completion API, AI-generated suggestions, or richer
  request templating beyond execution-mode prefix autocomplete.
- Expand the scope to unrelated thread-command editor refactors beyond the
  small extraction needed to share CodeMirror setup safely.
- Change planner routing semantics after prefix parsing, other than fixing the
  current parser and spec mismatch.

## Decisions

- Reuse the existing thread-command CodeMirror integration pattern through a
  small shared wrapper or extraction rather than building a second bespoke
  editor lifecycle in `TeamConsole`. The thread command editor already proves
  the repository's client-only setup, addon loading, and ARIA synchronization.
  A narrow shared wrapper keeps the request editor aligned with that behavior.
  Alternative considered: duplicate the CodeMirror setup directly inside
  `components/team-console.tsx`. Rejected because it would copy fragile
  browser-only lifecycle code and make future editor fixes drift.
- Keep `TeamConsole` as the owner of the `prompt` string and preserve the
  current form-submit path. The request editor should remain a controlled input
  that mirrors the same `prompt` state used for reruns, notices, and submit
  gating, while a hidden form field or equivalent state bridge preserves the
  current `FormData`-based submit contract. Alternative considered: move
  submission to editor-local state and bypass the form contract. Rejected
  because it would expand the surface area of a UI-only refactor.
- Define execution-mode prefix metadata in `lib/team/execution-mode.ts` as one
  shared source for parser matching, normalized prefix output, and autocomplete
  suggestions. That metadata should expose the canonical textual prefixes and
  any UI label or description needed by the request editor. Alternative
  considered: keep hardcoded prefixes in the parser and create separate UI
  suggestions in the editor. Rejected because the current mismatch already
  demonstrates the drift risk.
- Normalize the parser to colon-prefixed syntax first. The existing
  execute-mode spec, planner examples, and `lib/team/execution-mode.test.ts`
  all describe `execution:`, `benchmark:`, and `experiment:` as the accepted
  forms, so the implementation should match that contract before an editor
  starts suggesting prefixes. Alternative considered: keep slash-prefixed
  parsing and update the spec or tests to match. Rejected because it would
  contradict the approved OpenSpec behavior without new human approval.
- Keep autocomplete local and deterministic. The request editor can suggest
  execution-mode prefixes from shared metadata on focus and while typing at
  the start of the request, without fetching data from the server. Alternative
  considered: add a dedicated completion endpoint. Rejected because the
  required suggestions are static and already live in the client bundle.
- Scope styling updates to the request editor surface while reusing the
  existing CodeMirror theme primitives where possible. The request field needs
  to fit the console layout and multiline height, but it should not fork a
  second unrelated editor style system. Alternative considered: rely entirely
  on the thread-command editor class names. Rejected because the request field
  has different sizing and placeholder-copy expectations.

## Conventional Title

- Canonical request/PR title: `feat: replace team request editor`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Shared editor extraction regresses the thread command surface] -> Keep any
  wrapper API narrow, preserve the current thread-command props contract, and
  add focused tests for both entry points instead of rewriting the existing
  editor wholesale.
- [Parser and autocomplete drift returns] -> Store canonical prefixes and
  labels in one execution-mode metadata module, then derive both parsing and
  UI suggestions from that source.
- [Form submission changes accidentally drop multiline request text] -> Keep
  `TeamConsole` state authoritative and preserve the current `FormData` submit
  behavior through a hidden form value or equivalent controlled bridge.
- [Browser-only CodeMirror behavior becomes hard to test] -> Keep completion
  matching and execution-mode metadata in pure helpers so Vitest can verify
  them without a browser, and keep render coverage focused on server-safe
  markup.
- [The approved colon syntax surprises users who learned slash prefixes from
  the broken implementation] -> Update placeholder or hint copy to make the
  canonical `mode:` prefixes explicit in the editor itself.

## Migration Plan

1. Extract or introduce the smallest shared CodeMirror wrapper needed to power
   both the thread command editor and the new request editor without changing
   their state ownership.
2. Refactor `lib/team/execution-mode.ts` so canonical execution-mode metadata,
   autocomplete labels, and parsing logic use the same colon-prefixed
   definitions, then update the existing failing Vitest coverage.
3. Replace the `Request` textarea in `components/team-console.tsx` with the
   new CodeMirror request editor while keeping `prompt` state, form
   submission, disabled or busy gating, and branch deletion rerun behavior
   intact.
4. Add request-editor styling and focused regression coverage, then validate
   with `pnpm vitest lib/team/execution-mode.test.ts --run`, request-editor
   tests, `pnpm fmt`, `pnpm lint`, and `pnpm build` when the shared editor
   extraction touches structural UI code.
5. Roll back by restoring the textarea surface and the prior execution-mode
   parser if the editor integration proves unstable; no data migration is
   required because request text remains transient UI state.

## Open Questions

- None for the approved scope. This design assumes the spec-backed
  colon-prefixed execution-mode contract is the intended source of truth; if a
  human wants slash-prefixed commands instead, that needs explicit replanning
  because it changes the already approved execute-mode behavior.
