## Why

Proposal approval currently resolves request-branch heads with raw git
revision parsing, which can fail for slash-delimited branch names such as
`requests/workflow-pages/.../a1-proposal-1` even when the local branch exists.
The reported `ugit` approval failure blocks the workflow, and the fix needs to
preserve compatibility with already-persisted branch names instead of forcing a
branch rename or lane-data migration.

## What Changes

- Introduce the
  `approval-refs-a1-p1-harden-approval-branch-ref-resolution` OpenSpec change
  for proposal "Harden approval branch ref resolution".
- Harden the shared git branch-head lookup so local request branches resolve
  through explicit ref-safe paths instead of ambiguous raw branch arguments.
- Reuse the hardened lookup anywhere the approval pipeline depends on the same
  branch-head resolution behavior, especially proposal approval and final
  approval or archive refresh paths.
- Add regression coverage for nested request namespaces, including the reported
  `requests/workflow-pages/.../a1-proposal-1` approval scenario and
  compatibility with existing persisted branch identifiers.
- Keep the fix scoped to approval-time ref safety without renaming branch
  namespaces or changing the existing approval workflow shape.

## Capabilities

### New Capabilities

- `approval-refs-a1-p1-harden-approval-branch-ref-resolution`: Resolve
  approval-stage request branch heads through explicit local refs, preserve
  compatibility with existing persisted branch identifiers, and cover nested
  request namespaces with regression tests.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title:
  `fix(workflow-pages/approval): harden approval branch resolution`
- Conventional title metadata: `fix(workflow-pages/approval)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected code: `lib/git/ops.ts`, approval and archive flows under
  `lib/team/coding/*`, and the regression suites in `lib/git/ops.test.ts` and
  `lib/team/coding/index.test.ts`
- Affected systems: local git ref resolution for request branches, proposal
  approval, machine-review handoff checkpoints, final archive approval, and
  GitHub PR refreshes for slash-delimited request refs
