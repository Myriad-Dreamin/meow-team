# thread-command-placeholder-a1-p1-show-read-only-reason-in-the-thread-com Specification

## Purpose

Define the thread command composer placeholder behavior for eligibility-driven
read-only states, editable threads, and pending-only disablement so the editor
surfaces the disabled reason only when command eligibility blocks input.

## Requirements
### Requirement: Eligibility-driven read-only states expose the disabled reason in the placeholder

The thread command composer SHALL pass the current user-facing eligibility
`disabledReason` to the command editor placeholder whenever thread-command
eligibility makes the editor read-only.

#### Scenario: Ineligible latest assignments reuse the read-only reason

- **WHEN** the selected thread is archived, has no latest assignment yet, is
  being replanned, or still has queued, coding, or reviewing work
- **THEN** the thread command editor SHALL render read-only
- **AND** the editor placeholder SHALL equal the current disabled reason string
- **AND** the existing disabled-state explanation copy SHALL remain visible

### Requirement: Editable and pending-only states preserve the existing slash-command placeholder

The thread command composer SHALL keep `Enter slash commands...` whenever no
eligibility `disabledReason` is present, including normal editable threads and
pending-only disablement.

#### Scenario: Eligible thread keeps the default placeholder

- **WHEN** the selected thread is eligible for thread commands and the
  composer is not waiting on a submission
- **THEN** the editor SHALL remain editable
- **AND** the placeholder SHALL read `Enter slash commands...`

#### Scenario: Pending submission does not invent a new placeholder reason

- **WHEN** a thread command submission is pending and the composer has no
  eligibility `disabledReason`
- **THEN** the editor and submit button SHALL stay temporarily disabled using
  the existing pending behavior
- **AND** the placeholder SHALL continue to read `Enter slash commands...`

### Requirement: Focused placeholder regression coverage stays explicit

The repository SHALL include focused regression coverage for the read-only
reason placeholder path and the default placeholder path without changing
parser or server-side eligibility behavior.

#### Scenario: Placeholder drift fails focused tests

- **WHEN** `disabledReason` no longer reaches the read-only editor placeholder
  or editable threads stop showing `Enter slash commands...`
- **THEN** focused composer regression coverage SHALL fail before the change is
  considered complete
- **AND** the implementation SHALL keep command parsing and server-side
  eligibility behavior unchanged

### Requirement: Conventional title metadata stays explicit

The materialized OpenSpec artifacts SHALL preserve the canonical request/PR
title `fix: show disabled reason in command placeholder` and
conventional-title metadata `fix` without changing the approved change name.

#### Scenario: Materialized artifacts mirror approved title metadata

- **WHEN** planner materializes this change
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `fix: show disabled reason in command placeholder`
- **AND** conventional-title metadata SHALL remain `fix` instead of changing
  the proposal change path
  `thread-command-placeholder-a1-p1-show-read-only-reason-in-the-thread-com`
