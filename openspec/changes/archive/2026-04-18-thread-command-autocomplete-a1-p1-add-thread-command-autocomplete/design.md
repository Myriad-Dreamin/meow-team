## Context

This change captures proposal "Add Thread Command Autocomplete" as OpenSpec
change `thread-command-autocomplete-a1-p1-add-thread-command-autocomplete`.
The thread command surface already uses a local CodeMirror-compatible wrapper in
`packages/codemirror`, a controlled `ThreadCommandEditor` client component, and
shared parser or helper constants in `lib/team/thread-command.ts`. That stack
currently exposes helper text and placeholder guidance as static strings, but
it does not provide structured command metadata or any inline completion flow.

The implementation needs lightweight autocomplete without changing command
execution semantics. The local editor wrapper is intentionally small and does
not expose upstream CodeMirror completion add-ons, while the repository's
Vitest coverage stays node-oriented. That makes this primarily a controlled UI
integration problem: keep the editor contract stable, derive suggestions from
one metadata source, and extract pure autocomplete helpers so the risky parts
stay testable outside a browser runtime.

## Goals / Non-Goals

**Goals:**

- Centralize the four supported thread command definitions so helper copy,
  placeholder guidance, and autocomplete suggestions stay aligned.
- Show matching inline suggestions for the active slash-command token in the
  CodeMirror-based thread command editor.
- Support pragmatic suggestion controls: arrow navigation, `Tab` or `Enter` to
  accept, `Escape` to dismiss, and pointer selection.
- Insert valid command drafts that leave the caret ready for the next argument
  without adding literal placeholder tokens.
- Preserve the current thread-command draft owner, submit gating, pending
  button copy, disabled-state explanation copy, inline notices, and
  server-enforced parser grammar.
- Add node-safe regression coverage for metadata and autocomplete behavior.

**Non-Goals:**

- Change the supported slash-command grammar, parser errors, endpoint contract,
  approval flow, or replanning flow.
- Add live proposal-number completion from assignment data.
- Introduce a generic completion framework for other editors.
- Depend on upstream CodeMirror hint add-ons or browser-only UI test
  infrastructure.

## Decisions

- Represent supported thread commands as structured metadata near
  `lib/team/thread-command.ts`. Each definition should include the command name,
  syntax hint for display, and the draft text to insert on acceptance so helper
  text, placeholder copy, and autocomplete entries all derive from one source.
  This avoids duplicated strings drifting across the composer.
- Keep autocomplete matching and insertion in pure helpers rather than baking
  the rules directly into the editor effect. The helpers should answer three
  questions from plain inputs: whether the caret is within the active command
  token, which supported commands match the current token prefix, and how to
  replace the command token while preserving the rest of the draft. This keeps
  regression coverage node-safe and avoids tying the logic to DOM-only editor
  APIs.
- Implement the suggestion menu locally in `ThreadCommandEditor` instead of
  trying to extend the lightweight `packages/codemirror` wrapper into a generic
  completion system. The editor already owns the underlying textarea element,
  so it can observe value and caret changes, render a small overlay menu, and
  intercept only the keys needed while the menu is open.
- Keep `ThreadDetailPanel` and `ThreadCommandComposer` as the source of truth
  for draft, disabled, pending, and notice state. Autocomplete should remain a
  view-level enhancement inside the existing controlled editor interface rather
  than introducing another command state owner.
- Style the suggestion list inside the existing thread command editor shell so
  it fits the current thread panel and inherits the established mono typography,
  spacing, focus treatment, and disabled appearance. The menu should disappear
  when the editor is disabled, when no slash-command token is active, or after
  a suggestion is accepted.
- Keep parser tests as the grammar authority. New tests should cover shared
  command metadata plus autocomplete matching and insertion helpers, while the
  existing composer regression checks continue to guard helper copy,
  disabled-state copy, and pending behavior.

## Conventional Title

- Canonical request/PR title: `feat: enable thread command autocomplete`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Custom menu on a lightweight editor wrapper] -> Keep scope limited to the
  leading slash-command token and implement only the controls required for this
  composer instead of expanding the local CodeMirror wrapper into a reusable
  completion framework.
- [Caret-tracking drift between controlled state and the wrapped textarea] ->
  Read selection state from the underlying textarea after editor changes and
  dismiss suggestions when the caret context is ambiguous.
- [Suggestion acceptance interfering with normal typing] -> Intercept `Tab`,
  `Enter`, arrow keys, and `Escape` only while the autocomplete menu is open;
  otherwise preserve the current editor behavior.
- [Copy and suggestion metadata drifting apart] -> Generate helper text,
  placeholder guidance, and suggestion entries from the same structured command
  definitions and add explicit tests around that contract.
- [Browser-heavy test pressure] -> Keep menu matching and insertion logic in
  pure helpers so the repository can validate behavior in node-based Vitest
  without adopting jsdom or Playwright.

## Migration Plan

- Add structured thread-command metadata and pure autocomplete helpers near the
  existing thread-command module.
- Update the thread command editor and composer to show, navigate, accept, and
  dismiss suggestions while preserving the current command lifecycle.
- Adjust thread command editor styling so the suggestion menu fits the existing
  panel.
- Add focused regression coverage, then validate with `pnpm fmt`,
  `pnpm lint`, targeted Vitest coverage for autocomplete helpers and composer
  regressions, and `pnpm build` if the editor-composer contract changes beyond
  local UI wiring.
- Roll back by removing the autocomplete helpers and suggestion UI while
  leaving the parser and endpoint behavior untouched.

## Open Questions

- None for the approved scope. If approval later expands this work to include
  live proposal-number completion or other editor-wide completions, that should
  be proposed separately.
