# thread-command-editor-a1-p1-replace-thread-command-textarea-with-codemir Specification

## Purpose

Define the thread-command editor surface that replaces the thread command
textarea with a CodeMirror-based editor while preserving existing slash-command
draft, submit, helper-copy, disabled-state, and regression-test behavior.

## Requirements
### Requirement: Thread detail uses a CodeMirror command editor

The selected thread detail view SHALL replace the plain textarea command input
with a CodeMirror-based editor while keeping the command composer scoped to the
current thread's latest assignment.

#### Scenario: Idle thread shows the CodeMirror command composer

- **WHEN** a user opens a selected thread whose latest assignment is available
  for thread commands
- **THEN** the thread detail SHALL render a bottom CodeMirror-based command
  editor plus the existing submit control
- **AND** SHALL show placeholder guidance and helper copy that lists the
  supported command forms `/approve`, `/ready`, `/replan`, and `/replan-all`

#### Scenario: Disabled thread states explain why commands cannot run

- **WHEN** the selected thread is archived, has no latest assignment yet, is
  being replanned, or still has queued, coding, or reviewing work
- **THEN** the thread detail SHALL disable the CodeMirror editor and submit
  control
- **AND** SHALL render the same disabled-state explanation copy that tells the
  owner why thread commands are unavailable

### Requirement: CodeMirror swap preserves existing command submission behavior

The thread command composer SHALL preserve the existing slash-command draft and
submission behavior while swapping only the editing surface.

#### Scenario: Draft and submit gating remain unchanged

- **WHEN** the owner types into the CodeMirror editor
- **THEN** the composer SHALL update the same thread-command draft state used
  by the current thread detail panel
- **AND** SHALL keep the submit control disabled for empty or whitespace-only
  drafts and enabled for non-empty slash commands

#### Scenario: Pending and notice handling remain unchanged

- **WHEN** the owner submits a supported slash command through the CodeMirror
  composer
- **THEN** the composer SHALL use the existing thread command submission flow
  and pending-state button copy
- **AND** SHALL continue to render the latest success or error notice inline
  after the request resolves

### Requirement: Thread command editor coverage stays stable under current test constraints

The repository SHALL include focused regression coverage for the CodeMirror
composer surface without requiring a browser-only test environment, and SHALL
treat the helper-copy and disabled-copy regression as fixed acceptance
criteria.

#### Scenario: Helper and disabled copy regressions fail in Vitest

- **WHEN** the composer stops rendering the required helper text or disabled-state explanation copy
- **THEN** the relevant node-based Vitest coverage SHALL fail before the change
  is treated as complete

#### Scenario: Equivalent editor surface remains covered

- **WHEN** the textarea implementation is replaced by the CodeMirror editor
- **THEN** the regression suite SHALL continue to cover the command composer
  surface, pending state, and disabled state under the repository's current
  Next.js and Vitest setup

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`feat: replace thread command textarea with codemirror` and conventional-title
metadata `feat` through the materialized OpenSpec artifacts without encoding
slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change
paths.

#### Scenario: Materialized artifacts mirror the approved title metadata

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `feat: replace thread command textarea with codemirror`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead
  of changing the proposal change path
  `thread-command-editor-a1-p1-replace-thread-command-textarea-with-codemir`
