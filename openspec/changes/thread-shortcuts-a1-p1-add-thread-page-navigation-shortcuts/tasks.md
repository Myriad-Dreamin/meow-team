## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Add thread page navigation shortcuts" and confirm the canonical request/PR title is `feat: enable thread page shortcuts`
- [ ] 1.2 Confirm `Alt+N` returns to the existing Run Team and living-thread surface, numeric shortcuts stay scoped to thread detail tabs, and conventional-title metadata `feat` stays separate from `branchPrefix` and change paths

## 2. Shortcut Helpers

- [ ] 2.1 Extract a pure shortcut helper that parses guarded `Alt+N` and `Alt+1` through `Alt+9` actions while ignoring editable targets
- [ ] 2.2 Derive deterministic numeric targets from living non-terminal threads using the existing sidebar grouping and thread sorting rules

## 3. Workspace Wiring

- [ ] 3.1 Subscribe `components/team-workspace.tsx` to window `keydown` events with a stable client listener and only respond while a thread detail tab is selected
- [ ] 3.2 Reuse the existing Run Team and thread-tab selection handlers so shortcut navigation preserves current tab persistence and leaves archived, settings, polling, and lane-popover behavior unchanged

## 4. Coverage and Validation

- [ ] 4.1 Add targeted Vitest coverage for shortcut parsing, deterministic ordering, missing-index no-ops, and editable-target guards
- [ ] 4.2 Run `pnpm fmt`, `pnpm lint`, `pnpm test`, and `pnpm build` before review
