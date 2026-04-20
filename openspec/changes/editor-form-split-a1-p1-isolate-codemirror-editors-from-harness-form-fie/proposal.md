## Why

The shared `.harness-form-field` primitive currently applies descendant `span`
and `textarea` styling to every nested control, which leaks native form-field
chrome into the embedded CodeMirror DOM used by `TeamRequestEditor` and
`ThreadCommandEditor`. Tightening that contract now fixes the styling bug
without regressing the native request and feedback fields that still depend on
the existing harness form look.

## What Changes

- Keep `.harness-form-field` as a structural layout wrapper and move caption
  plus native `input`/`select`/`textarea` styling onto explicit harness
  native-field hooks.
- Update the Continuous Assignment Console, thread feedback forms, and related
  harness-native consumers to use the new caption and native-control path
  while leaving the embedded CodeMirror editors on their existing module
  styling.
- Preserve the current `TeamRequestEditor` and `ThreadCommandEditor` visuals
  by keeping `components/codemirror-text-editor.module.css` as the source of
  truth for editor chrome, focus, placeholder, and text presentation.
- Add focused regression coverage that fails if broad
  `.harness-form-field` descendant selectors are reintroduced or if the editor
  surfaces start inheriting harness native-field styling again.
- Preserve the canonical request/PR title
  `fix(harness/forms): separate editor and field styles` and
  conventional-title metadata `fix(harness/forms)` in the materialized
  artifacts.

## Capabilities

### New Capabilities

- `editor-form-split-a1-p1-isolate-codemirror-editors-from-harness-form-fie`:
  defines the harness form styling boundary that keeps native inputs on the
  shared form chrome while isolating embedded CodeMirror editors from broad
  descendant selectors.

### Modified Capabilities

- None.

## Impact

- Affected code: `app/globals.css`, `components/team-console.tsx`,
  `components/thread-command-composer.tsx`,
  `components/thread-status-board.tsx`,
  `components/thread-detail-timeline.tsx`, and adjacent editor or form
  regression tests.
- APIs and behavior: no backend API changes; existing planner submission,
  feedback submission, request parsing, and thread-command flows stay
  unchanged.
- Systems: Continuous Assignment Console request entry, thread command
  composition, and proposal or request-group feedback forms keep their current
  UI behavior while using a narrower harness form styling contract.
