## 1. Validate Skill Sets

- [ ] 1.1 Confirm `EMBEDDED_SKILLS` contains the 8 installable MeowFlow skills and that install/list output still reports 8.
- [ ] 1.2 Confirm the thread agent skill set intentionally contains only plan, code, review, execute, validate, and archive role/action skills.

## 2. Deduplicate Agent Skill Support

- [ ] 2.1 Export a shared supported thread agent skill list from `packages/meow-flow/src/thread-state.ts`.
- [ ] 2.2 Replace the local `SUPPORTED_SKILLS` array in `packages/meow-flow/src/agent-command.ts` with the shared export.
- [ ] 2.3 Generate `mfl agent update-self` unknown-skill diagnostics from the shared list instead of hardcoded text.

## 3. Tests and Validation

- [ ] 3.1 Add or update focused tests proving install/list output still reports the 8 embedded skills.
- [ ] 3.2 Add or update focused tests proving `agent update-self` detects shared thread agent skills and reports the shared expected list when detection fails.
- [ ] 3.3 Run the changed MeowFlow test file with `npx vitest run <file> --bail=1`.
- [ ] 3.4 Run `npm run typecheck`.
