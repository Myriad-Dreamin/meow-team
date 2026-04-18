## Why

The thread command composer already supports a small, fixed slash-command
grammar, but owners still need to remember the valid command names and argument
shapes while typing into the editor. Adding inline autocomplete now makes the
supported commands easier to discover and reduces invalid draft churn without
changing parser or endpoint semantics.

## What Changes

- Introduce the
  `thread-command-autocomplete-a1-p1-add-thread-command-autocomplete`
  OpenSpec change for proposal "Add Thread Command Autocomplete".
- Centralize metadata for the supported thread commands `/approve`, `/ready`,
  `/replan`, and `/replan-all` so helper text, placeholder guidance, and
  autocomplete suggestions use one source of truth.
- Extend the local CodeMirror-based thread command editor to detect the active
  slash-command token and show matching suggestions with keyboard and pointer
  acceptance controls.
- Insert a valid command draft when the owner accepts a suggestion, keeping the
  caret ready for the next argument while avoiding literal placeholder tokens
  that would become invalid commands.
- Preserve the current helper copy, disabled-state explanation copy,
  pending-state button text, inline notices, submit gating, and existing
  server-side command grammar.
- Add node-safe regression coverage for shared command metadata plus
  autocomplete matching and insertion helpers without expanding scope into
  browser-only editor tests.

## Capabilities

### New Capabilities

- `thread-command-autocomplete-a1-p1-add-thread-command-autocomplete`:
  Provide inline autocomplete guidance for supported thread commands in the
  CodeMirror-based thread command editor while preserving the existing command
  submission contract and syntax rules.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat: enable thread command autocomplete`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Expected implementation surfaces: `lib/team/thread-command.ts`,
  `components/thread-command-editor.tsx`,
  `components/thread-command-composer.tsx`, `app/globals.css`,
  `components/thread-command-composer.test.ts`, and focused autocomplete helper
  coverage under `lib/team` or `components`
- No parser grammar, thread-command endpoint semantics, approval flow,
  replanning workflow, or live proposal-number suggestion data changes are
  expected
- Planner deliverable: Single proposal recommended because the shared command
  metadata, editor suggestion UX, and regression coverage all depend on the
  same thread command composer surface
