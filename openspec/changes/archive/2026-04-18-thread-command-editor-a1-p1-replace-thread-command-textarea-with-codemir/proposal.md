## Why

The selected thread detail view already has a slash-command composer, but it
still uses a plain textarea even though the command surface is structured,
syntax-sensitive, and visually part of the thread workspace. Swapping in a
CodeMirror-based editor now improves the command-writing surface while also
fixing the current regression where the helper copy and disabled-state message
are no longer rendered in the composer.

## What Changes

- Introduce the
  `thread-command-editor-a1-p1-replace-thread-command-textarea-with-codemir`
  OpenSpec change for proposal "Replace Thread Command Textarea With
  CodeMirror".
- Replace the thread command composer's textarea surface with a
  CodeMirror-based editor that fits the existing selected-thread panel layout.
- Preserve the current slash-command draft, submit-button gating, trim-on-submit
  behavior, idle-thread disabled rules, and inline success or error notices.
- Restore the helper copy that lists the supported slash-command forms and the
  disabled-state explanation copy that tells the owner why commands cannot run.
- Update thread-command editor styling and focused regression coverage so the
  composer remains stable under the current Next.js App Router and node-based
  Vitest setup.
- Keep parser grammar, endpoint semantics, broader thread-tab layout, and any
  non-composer workflow redesign out of scope.

## Capabilities

### New Capabilities

- `thread-command-editor-a1-p1-replace-thread-command-textarea-with-codemir`:
  Replace the thread command textarea with a CodeMirror editor while preserving
  existing slash-command behavior, restoring helper and disabled copy, updating
  composer styling, and covering the new surface with focused regression tests.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat: replace thread command textarea with codemirror`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Expected implementation surfaces: `components/thread-command-composer.tsx`,
  a new client-safe thread command editor component, `components/thread-detail-panel.tsx`,
  `app/globals.css`, `components/thread-command-composer.test.ts`,
  `package.json`, and `pnpm-lock.yaml`
- No thread-command API, parser grammar, or persisted thread-history schema
  changes are expected; the work should stay limited to the thread command
  composer experience and its regression coverage
- Planner deliverable: Single proposal recommended because the dependency
  install, editor swap, helper-copy regression fix, styling update, and
  equivalent coverage all depend on the same thread command composer surface
