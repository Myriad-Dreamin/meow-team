## Context

The planner request tab and thread command tab already share a
CodeMirror-backed editor primitive, but the runtime currently only loads the
addons needed for placeholders and hints. That leaves both surfaces without
markdown token styling, and inherited uppercase text presentation leaks into
the editable content. The requested polish is intentionally limited to the two
editable request surfaces and must not change preview behavior, lane output,
or unrelated form fields.

## Goals / Non-Goals

**Goals:**
- Enable markdown-aware syntax highlighting through the shared
  `CodeMirrorTextEditor` runtime.
- Restore normal text casing in editable content for both
  `.team-request-editor` and `.thread-command-editor`.
- Preserve existing autocomplete, submission, and disabled-state behavior.
- Add focused regression coverage around the shared editor dependency contract
  and the affected UI surfaces.
- Keep the proposal metadata aligned with the canonical title
  `feat: enable markdown highlighting and normal casing` and conventional
  title `feat`.

**Non-Goals:**
- Adding markdown preview, rendered output formatting, or fenced-language
  highlighting beyond CodeMirror's built-in markdown mode.
- Expanding the styling change to read-only surfaces or unrelated inputs.
- Reworking command parsing, request parsing, or autocomplete semantics.

## Decisions

- Load markdown mode in the shared editor runtime rather than forking editor
  implementations per surface. This keeps both affected tabs on the same
  dependency and configuration path, which is where the reported issues
  converge.
- Fix uppercase presentation at the editor root by applying explicit
  non-uppercase rules to the editable CodeMirror content and verifying whether
  input-related capitalization attributes need to be pinned for consistency.
  This addresses the regression at the shared presentation layer instead of
  patching each consumer independently.
- Scope styling to the existing `.team-request-editor` and
  `.thread-command-editor` wrappers so the change only affects the approved
  request-entry surfaces.
- Extend focused existing tests near `thread-command-editor` and
  `team-console` so regressions in editor packaging, rendering guards, and
  shared editor configuration fail quickly without introducing broad UI test
  churn.

## Risks / Trade-offs

- [Markdown mode covers only common markdown tokens] → Accept the default
  CodeMirror 5 highlighting now and defer richer fenced-language highlighting
  to a later change if needed.
- [Shared runtime changes can affect both editors at once] → Keep the scope
  narrow, preserve current autocomplete integrations, and add regression tests
  for both request surfaces.
- [Casing can be influenced by both CSS and input behaviors] → Check the
  editor styling and relevant input attributes together so visual casing stays
  stable across browsers.
