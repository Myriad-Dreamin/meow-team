## Why

Machine-reviewed lanes currently stop at a single `Approve and Archive`
finalization path, which forces proposal archival even when the owner wants the
branch delivered without keeping the lane-local change scaffold. This change
adds a second explicit finalization mode so human approval can delete the active
OpenSpec change on-branch, push that branch update, and still finish the same
GitHub PR flow with retry-safe state.

## What Changes

- Introduce the `approve-delete-a1-p1-add-approve-and-delete-finalization-for-machine-rev`
  OpenSpec change for proposal "Add approve-and-delete finalization for
  machine-reviewed lanes".
- Extend machine-reviewed final approval from a single archive action into
  explicit `archive` and `delete` finalization modes that flow through the UI,
  approval API, thread action entrypoint, run args, and final-approval stage.
- Add an `Approve and Delete` action beside `Approve and Archive`, with
  mode-specific pending, success, and error copy in thread status, detail, and
  timeline surfaces.
- Refactor archive-only finalization into a shared flow plus mode-specific
  proposal-artifact handling so delete mode removes
  `openspec/changes/<change>`, commits and pushes the deletion, then refreshes
  the existing GitHub PR.
- Persist finalization intent and artifact disposition explicitly in lane state
  and history so retries remain idempotent after partial success, then add
  regression coverage for delete-mode finalization, resume behavior, and
  archived/deleted guardrails.

## Capabilities

### New Capabilities

- `approve-delete-a1-p1-add-approve-and-delete-finalization-for-machine-rev`:
  add delete-mode finalization for machine-reviewed lanes while preserving the
  existing archive path and GitHub PR refresh flow.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat: enable approve-and-delete finalization`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected UI: `components/thread-view-utils.ts`,
  `components/thread-status-board.tsx`, `components/thread-detail-panel.tsx`,
  `components/thread-detail-timeline.tsx`
- Affected backend and orchestration: `app/api/team/approval/route.ts`,
  `lib/team/thread-actions.ts`, `lib/team/coding/shared.ts`,
  `lib/team/coding/archiving.ts`
- Affected state and history: lane finalization metadata, planner notes, and
  timeline events that distinguish archived versus deleted outcomes
- Validation: `pnpm fmt`, targeted Vitest coverage for approval/finalization
  helpers and UI action derivation, `pnpm lint`, `pnpm build`
