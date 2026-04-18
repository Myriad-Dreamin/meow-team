## Why

The thread command composer currently depends on a local
`packages/codemirror` shim that only approximates the upstream runtime, which
makes dependency review, addon support, and editor behavior harder to trust.
The same surface still lacks assignment-aware autocomplete, so owners have to
remember slash-command syntax and proposal numbers even though the latest
thread detail state already contains that information.

## What Changes

- Introduce the
  `thread-command-editor-a1-p1-adopt-upstream-codemirror-and-add-thread-com`
  OpenSpec change for proposal "Adopt upstream CodeMirror and add thread
  command autocomplete".
- Replace the workspace-linked `packages/codemirror` shim with the approved
  upstream CodeMirror 5 package and update the dependency contract, lockfile,
  and review guards accordingly.
- Rework the thread command editor integration around the upstream runtime
  while preserving the current placeholder guidance, read-only handling, ARIA
  sync, loading or error fallback, draft state, and submit behavior.
- Move supported thread-command metadata into a shared source in
  `lib/team/thread-command.ts` so parser copy, helper text, placeholder text,
  and autocomplete suggestions stay aligned.
- Add client-side autocomplete for `/approve`, `/ready`, `/replan`, and
  `/replan-all`, including latest-assignment proposal-number suggestions for
  the commands that accept proposal numbers.
- Update thread command styling and focused regression coverage for the
  upstream editor DOM, hint dropdown behavior, and the revised dependency
  contract.
- Keep backend slash-command semantics, disabled gating, and submit or result
  UX unchanged beyond the shared metadata extraction needed to support the new
  editor behavior.

## Capabilities

### New Capabilities

- `thread-command-editor-a1-p1-adopt-upstream-codemirror-and-add-thread-com`:
  Adopt the upstream CodeMirror runtime for the thread command editor and add
  assignment-aware autocomplete for the supported slash commands while
  preserving the current command composer lifecycle.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat: integrate upstream CodeMirror command autocomplete`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Expected implementation surfaces: `package.json`, `pnpm-lock.yaml`,
  `components/thread-command-editor.tsx`,
  `components/thread-command-composer.tsx`,
  `components/thread-detail-panel.tsx`, `lib/team/thread-command.ts`,
  `components/thread-command-composer.test.ts`,
  `components/thread-command-editor.review.test.ts`, `app/globals.css`, and
  removal of the local shim path from the editor integration
- Affected systems: selected-thread UI, thread-command dependency wiring,
  client-side autocomplete behavior, and node-based Vitest coverage
- Scope boundaries: no new autocomplete API, no backend slash-command behavior
  changes beyond shared helper extraction, and no change to disabled gating or
  submit or result UX
- Planner deliverable: keep this as one proposal because the dependency swap,
  shared command metadata, editor integration, CSS adjustments, and
  autocomplete behavior all depend on the same `ThreadCommandEditor` surface
- Approval note: keep the shared coder and reviewer pool idle until the owner
  approves this proposal
