## Context

The harness currently uses `.harness-form-field` as both a layout wrapper and
the styling hook for label text plus native controls. Because the global CSS
targets descendant `span`, `input`, `select`, and `textarea` nodes, any
embedded editor DOM inside that wrapper can inherit native form styling even
when the editor already has module-scoped presentation rules. This is visible
in the planner request editor and the thread command editor, both of which sit
inside `.harness-form-field` wrappers while relying on
`components/codemirror-text-editor.module.css` for their approved appearance.
At the same time, the request title, thread ID, repository picker, and thread
feedback textareas still need the current harness-native chrome.

## Goals / Non-Goals

**Goals:**

- Narrow the harness form contract so `.harness-form-field` handles layout only.
- Preserve the current chrome and focus styling for the native request-title,
  thread-id, repository, and feedback fields.
- Keep `TeamRequestEditor` and `ThreadCommandEditor` visually unchanged and
  sourced from the existing CodeMirror CSS module.
- Add focused regression coverage for the CSS boundary between native fields
  and embedded editors.
- Keep the proposal metadata aligned with the canonical request/PR title
  `fix(harness/forms): separate editor and field styles` and conventional
  title `fix(harness/forms)`.

**Non-Goals:**

- Redesigning harness form spacing, copy, or submission workflows.
- Replacing native feedback textareas with CodeMirror editors.
- Changing request parsing, thread-command parsing, or autocomplete behavior.
- Introducing browser-only visual regression tooling for this small CSS
  contract change.

## Decisions

- Split the current `.harness-form-field` contract into a layout wrapper plus
  explicit caption and native-control hooks that are applied only where native
  harness chrome is required. This removes editor leakage at the source.
  Alternative considered: keep the broad descendant selectors and patch the
  CodeMirror subtree with stronger overrides. Rejected because it couples the
  harness primitive to third-party editor DOM and makes future editor changes
  brittle.
- Update affected consumers explicitly in `TeamConsole`,
  `ThreadStatusBoard`, and `ThreadDetailTimeline` rather than introducing a
  different broad selector pattern. Explicit wiring makes every native field
  opt into the shared chrome and keeps embedded editors on the structural
  wrapper only. Alternative considered: restrict the existing selectors with
  combinators or `:not(...)` filters. Rejected because the editor DOM still
  contains nested `textarea` and `span` nodes, so exclusion selectors are easy
  to miss and hard to maintain.
- Preserve `components/codemirror-text-editor.module.css` as the only source
  of editor chrome, focus, placeholder, and text-presentation rules for the
  request and thread-command editors. The fix should remove global leakage, not
  duplicate editor styling in globals or consumer components.
- Lock the new boundary with focused file-level and component-adjacent tests
  instead of broader end-to-end coverage. The risky behavior is the CSS
  contract itself, so targeted assertions against `app/globals.css` and the
  affected renderers provide faster regression feedback with less test churn.

## Risks / Trade-offs

- [A native field is missed during the split and loses its current chrome] →
  Audit every current `.harness-form-field` consumer in the same change and
  migrate each native `input`, `select`, and `textarea` to the explicit
  native-control path before accepting the change.
- [A future refactor reintroduces descendant selectors on the structural
  wrapper] → Add focused regression coverage that fails on broad
  `.harness-form-field span` or `.harness-form-field textarea` rules.
- [CodeMirror DOM details change in a future upgrade] → Keep the contract at
  the harness wrapper level and avoid selectors that depend on editor-internal
  markup beyond the existing module CSS.

## Migration Plan

This is a single-step UI refactor with no persisted-data migration. Rollout is
the merged CSS and component wiring change; rollback is a direct revert of the
new harness native-field hooks and their regression tests.

## Open Questions

None.
