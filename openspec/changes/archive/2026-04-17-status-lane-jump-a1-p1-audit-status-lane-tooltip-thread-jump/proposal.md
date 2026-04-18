## Why

The workspace status bar already ships the lane-tooltip flow, but this request
reads like a regression follow-up rather than a net-new feature. Current code
in `TeamStatusBar` and `TeamWorkspace` already covers most of the requested
behavior, so the approved work should first reproduce any remaining gap in the
existing `workspace-status-lane-list` interaction and then apply only the
targeted repair needed to restore reliable thread jumps.

## What Changes

- Introduce the `status-lane-jump-a1-p1-audit-status-lane-tooltip-thread-jump`
  OpenSpec change for proposal "Audit status-lane tooltip thread jump".
- Audit the current status-lane popover flow and reproduce any remaining gap
  between non-zero lane pills, matching living-thread rows, and thread-tab
  navigation before broadening implementation.
- Preserve the existing `TeamWorkspace` thread-selection path and current
  lane-bucketing behavior while applying only the targeted fixes needed so
  hover, focus, and click still reveal matching living threads and clicking a
  row dismisses the popover after switching to the matching thread tab.
- Add focused rendered interaction coverage for the status-lane popover flow
  and leave settings, archived-thread reveal, host telemetry polling, and
  archived-thread exclusion unchanged.

## Capabilities

### New Capabilities

- `status-lane-jump-a1-p1-audit-status-lane-tooltip-thread-jump`: Audit the
  existing status-lane tooltip thread-jump flow, restore any regressed
  matching-thread navigation, and add focused interaction coverage without
  reopening broader status-bar behavior.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title:
  `fix(workspace/status-bar): restore status lane thread links`
- Conventional title metadata: `fix(workspace/status-bar)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected surfaces: `components/team-status-bar.tsx`,
  `components/team-workspace.tsx`, `components/team-status-bar-lane-utils.ts`,
  and focused rendered interaction coverage for the status-bar flow
- Coding-review execution: pooled workers with reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Single proposal only as a regression follow-up. The
  current base behavior already matches the request closely, so implementation
  should start by reproducing any gap in the existing
  `workspace-status-lane-list` flow. Preserve the current `TeamWorkspace`
  thread-selection path and lane bucketing behavior. Confirm that each
  non-zero lane pill still opens on hover, focus, and click; that the panel
  lists only matching living threads; that same-thread multiplicity remains
  visible when multiple lanes contribute to one pill; and that clicking a row
  dismisses the panel and switches to the matching thread tab. Keep settings,
  archived-thread toggle, host telemetry polling, and archived-thread
  exclusion unchanged. The pooled coder/reviewer lanes stay idle until a human
  approves this narrow regression proposal.
