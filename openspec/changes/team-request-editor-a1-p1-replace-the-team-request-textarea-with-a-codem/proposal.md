## Why

The Continuous Assignment Console still uses a plain `Request` textarea even
though the thread command surface already relies on a CodeMirror editor with a
better controlled-input and autocomplete model. The same request field is also
the entry point for execution-mode prefixes, but the current parser
implementation disagrees with the approved execute-mode spec and tests on the
canonical prefix syntax, so adding UI suggestions without first sharing one
prefix contract would reinforce the wrong behavior.

## What Changes

- Introduce the
  `team-request-editor-a1-p1-replace-the-team-request-textarea-with-a-codem`
  OpenSpec change for proposal "Replace the team request textarea with a
  CodeMirror request editor".
- Replace the Continuous Assignment Console `Request` textarea in
  `components/team-console.tsx` with a CodeMirror-based editor that keeps the
  current `prompt` state, placeholder guidance, submit lifecycle, branch
  deletion rerun flow, and disabled or busy gating unchanged.
- Reuse the proven client-only CodeMirror patterns from
  `components/thread-command-editor.tsx`, either through a small shared wrapper
  or a tightly scoped extraction, so the request editor preserves loading or
  error fallback, ARIA sync, controlled-value updates, and editor sizing.
- Move execution-mode prefix definitions into shared metadata in
  `lib/team/execution-mode.ts` so the parser, UI suggestions, and any
  autocomplete labels use the same canonical prefixes.
- Normalize the current execution-mode prefix contract to the spec-backed
  colon form `execution:`, `benchmark:`, and `experiment:` so planner parsing,
  autocomplete, and focused tests stay aligned.
- Add request-editor autocomplete for execution-mode prefixes without changing
  planner submission semantics, backend routing, or the rest of the console
  form.
- Add focused regression coverage for the request editor surface and the
  execution-mode parser mismatch that currently leaves
  `pnpm vitest lib/team/execution-mode.test.ts --run` failing.

## Capabilities

### New Capabilities

- `team-request-editor-a1-p1-replace-the-team-request-textarea-with-a-codem`:
  Replace the team request textarea with a CodeMirror editor and shared
  execution-mode prefix autocomplete while preserving the existing Continuous
  Assignment Console request lifecycle.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat: replace team request editor`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Expected implementation surfaces: `components/team-console.tsx`, a new or
  extracted request-editor wrapper near
  `components/thread-command-editor.tsx`, `lib/team/execution-mode.ts`,
  `lib/team/execution-mode.test.ts`, focused request-editor tests, and
  `app/globals.css`
- Affected systems: Continuous Assignment Console request entry, execution-mode
  prefix parsing, client-side autocomplete, and node-based Vitest regression
  coverage
- Scope boundaries: no new backend autocomplete API, no changes to planner
  submission routing beyond fixing the existing prefix contract drift, and no
  redesign of the rest of the console form
- Planner deliverable: keep this as one proposal because the editor swap,
  shared execution-mode metadata, parser normalization, styling, and
  regression coverage all depend on the same request-input surface
- Approval note: the shared coding-review pool stays idle until the owner
  approves this proposal
