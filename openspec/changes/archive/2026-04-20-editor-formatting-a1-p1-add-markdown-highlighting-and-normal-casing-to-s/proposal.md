## Why

The shared request editors currently render plain text without markdown-aware
syntax highlighting, and inherited uppercase presentation makes typed content
look incorrect in both the planner request tab and the thread command tab.
Fixing both issues together keeps the shared CodeMirror editing experience
consistent without widening scope into preview or unrelated form changes.

## What Changes

- Upgrade the shared `CodeMirrorTextEditor` runtime to load the CodeMirror 5
  markdown mode alongside the existing placeholder and hint addons.
- Add shared editor styling that applies markdown token highlighting and
  restores normal text casing for editable content in both the team request
  and thread command editors.
- Keep autocomplete, disabled-state behavior, and existing request or slash
  command submission flows unchanged while updating the shared editor surface.
- Add focused regression coverage for the shared editor packaging and the two
  affected editor surfaces so markdown mode and normal-casing behavior stay
  protected.
- Preserve the canonical request/PR title `feat: enable markdown highlighting and normal casing`
  and conventional-title metadata `feat` in the materialized artifacts.

## Capabilities

### New Capabilities
- `editor-formatting-a1-p1-add-markdown-highlighting-and-normal-casing-to-s`:
  defines markdown-aware highlighting and normal-casing behavior for the
  shared request editors backed by the common CodeMirror runtime.

### Modified Capabilities

- None.

## Impact

- Affected code: `components/codemirror-text-editor.tsx`,
  `components/team-request-editor.tsx`,
  `components/thread-command-editor.tsx`, `app/globals.css`, and adjacent
  editor tests.
- Dependencies: adds the required CodeMirror markdown mode package/runtime
  wiring while preserving the current bundled dependency model.
- Systems: Continuous Assignment Console request entry and thread-command
  composition keep using the shared editor stack with improved presentation.
