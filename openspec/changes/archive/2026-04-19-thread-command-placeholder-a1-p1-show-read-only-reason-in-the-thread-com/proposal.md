## Why

The thread command composer already computes a user-facing `disabledReason`
when the latest assignment is not eligible for slash commands, but the editor
still shows the generic `Enter slash commands...` placeholder in that
read-only state. Reusing the same reason in the placeholder makes the blocked
state self-explanatory without changing thread-command parsing, execution, or
server-side gating.

## What Changes

- Materialize OpenSpec change
  `thread-command-placeholder-a1-p1-show-read-only-reason-in-the-thread-com`
  for proposal "Show read-only reason in the thread command placeholder".
- Update the thread command composer to pass `disabledReason` as the editor
  placeholder whenever the editor is read-only for eligibility reasons.
- Preserve the existing `Enter slash commands...` placeholder when no
  eligibility reason is present, including the current editable path and the
  pending-only disablement path.
- Add focused regression coverage for the reason-bearing read-only placeholder
  path and the default editable placeholder path without expanding command
  parsing or backend eligibility scope.

## Capabilities

### New Capabilities

- `thread-command-placeholder-a1-p1-show-read-only-reason-in-the-thread-com`:
  Show the current eligibility-driven read-only reason in the thread command
  editor placeholder while preserving the existing editable placeholder and
  focused regression coverage.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `fix: show disabled reason in command placeholder`
- Conventional title metadata: `fix`
- Conventional-title scope remains metadata and does not alter `branchPrefix`
  or the OpenSpec change path.

## Impact

- Affected repository: `meow-team`
- Expected implementation surfaces: `components/thread-command-composer.tsx`,
  `components/thread-command-editor.tsx` only if runtime placeholder syncing
  needs adjustment, and `components/thread-command-composer.test.ts`
- No backend, parser, or eligibility-rule changes are expected
- Approval-sensitive assumption: pending submission continues to use the
  existing `Enter slash commands...` placeholder unless a follow-up approval
  explicitly introduces separate pending copy
