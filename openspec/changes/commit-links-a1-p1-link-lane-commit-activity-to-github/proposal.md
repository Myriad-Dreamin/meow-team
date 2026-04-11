## Why

Update dispatch commit-related activity/event messages to emit explicit markdown links when a GitHub commit URL exists, render those messages safely in the thread UI with `markdown-it`, and cover the behavior with regression tests without regex-based auto-linking. Single proposal: emit explicit markdown commit links in lane activity/event text and render them safely in thread surfaces. This proposal is one candidate implementation for the request: renders commit hashes with github url - `shortenCommit` now renders to markdown syntax `[12-hash](github-url)` and in frontend we render this using markdown-it. - regex could match `shortenCommit`.

## What Changes

- Introduce the `commit-links-a1-p1-link-lane-commit-activity-to-github` OpenSpec change for proposal "Link lane commit activity to GitHub".
- Update dispatch commit-related activity/event messages to emit explicit markdown links when a GitHub commit URL exists, render those messages safely in the thread UI with `markdown-it`, and cover the behavior with regression tests without regex-based auto-linking.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `commit-links-a1-p1-link-lane-commit-activity-to-github`: Update dispatch commit-related activity/event messages to emit explicit markdown links when a GitHub commit URL exists, render those messages safely in the thread UI with `markdown-it`, and cover the behavior with regression tests without regex-based auto-linking.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `feat(lane/commits): Link lane commit activity to GitHub`
- Conventional title metadata: `feat(lane/commits)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Link Lane Commit References in Activity Feeds` Suggested OpenSpec seed: `link-lane-commit-references` Objective: make commit hashes inside lane activity and event messages clickable GitHub links by generating explicit markdown at the dispatch layer and rendering that markdown safely in the thread UI. Why this is one proposal: - Backend message generation and frontend rendering are tightly coupled. - Splitting them would create an intermediate state where raw markdown is persisted but not rendered, or rendering is added without deterministic link data. Execution outline: 1. Make commit message formatting URL-aware in `lib/team/dispatch.ts` so pushed commits become explicit markdown links and non-pushed review commits stay plain text. 2. Update only the commit-related activity/event strings that currently use `shortenCommit`. 3. Introduce a shared, safe markdown renderer for lane activity/event text and wire it into the status-board and detail-panel lane feeds. 4. Preserve the existing structured commit/branch displays outside the activity feed. 5. Add regression tests for dispatch formatting and UI rendering, then run `pnpm fmt`, `pnpm lint`, and relevant tests/build checks as feasible. Approval notes: - This should be materialized as a single OpenSpec change. - The coder/reviewer pool should remain idle until human approval arrives.
