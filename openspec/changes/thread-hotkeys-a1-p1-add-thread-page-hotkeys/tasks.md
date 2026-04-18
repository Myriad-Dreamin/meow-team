## 1. Shortcut Resolution

- [ ] 1.1 Add a small pure thread-page hotkey helper that preserves the approved `feat: enable thread page hotkeys` / `feat` metadata context, matches `Alt+N` and `Alt+1` through `Alt+9`, rejects editable targets, and resolves digits against ordered timeline anchors.
- [ ] 1.2 Add focused Vitest coverage for supported shortcuts, ignored editable surfaces, unsupported combinations, and missing-anchor fallthrough behavior.

## 2. Thread Detail Integration

- [ ] 2.1 Update `components/team-workspace.tsx` so thread-page hotkeys are only active while a thread tab is selected, `Alt+N` reveals the sidebar if needed, and focus lands on the existing `Living Threads` navigation target.
- [ ] 2.2 Update `components/thread-detail-timeline.tsx` so the ordered rail anchors expose the data and scroll hooks needed for `Alt+1` through `Alt+9` to jump to the matching thread timeline targets while keeping active-anchor highlighting in sync.
- [ ] 2.3 Add only the minimal focus-visibility or discoverability styling needed if the reused navigation targets need clearer keyboard focus treatment.

## 3. Validation

- [ ] 3.1 Extend the existing timeline helper test surface to cover hotkey-driven anchor ordering and scroll-target selection.
- [ ] 3.2 Run the required validation for this frontend-only shortcut change: `pnpm fmt`, `pnpm lint`, `pnpm test`, and `pnpm build`.
