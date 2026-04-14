## 1. Thread Readiness Flow

- [ ] 1.1 Replace repeated stage-local planning worktree preparation in `lib/team/coding/plan.ts` with one repository-backed helper that resolves or claims a thread-owned managed slot and prepares the checkout before planner-side agent work starts.
- [ ] 1.2 Persist the prepared `threadWorktree` so resume, replan, and metadata-generation entry paths reuse the same slot instead of replaying the workaround.

## 2. Lifecycle Integration

- [ ] 2.1 Update approval, coding, review, and final archive paths to consume the existing thread-owned slot instead of claiming a second managed worktree.
- [ ] 2.2 Keep archive handling explicit by releasing the live claim in `archiveTeamThread()` while leaving any historical assignment or lane slot metadata audit-safe and ignored by active claim resolution.

## 3. Regression Coverage

- [ ] 3.1 Rewrite `lib/team/coding/index.test.ts` assertions around lifecycle invariants: one slot claimed and reused per thread, concurrent second planning blocked, and resumed or replanned threads keeping their prior slot.
- [ ] 3.2 Extend `lib/team/history.test.ts` so archiving frees the slot for future threads and archived metadata no longer counts as an active claim.
- [ ] 3.3 Run the relevant test coverage and repo validation required for this lifecycle change, including targeted Vitest suites, `pnpm lint`, and `pnpm build` if integration surfaces move.
