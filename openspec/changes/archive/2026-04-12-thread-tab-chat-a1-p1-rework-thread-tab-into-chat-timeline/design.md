## Context

This change captures proposal "Rework Thread Tab Into Chat Timeline" as OpenSpec change `thread-tab-chat-a1-p1-rework-thread-tab-into-chat-timeline`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Materialize OpenSpec change `thread-tab-chat-layout` to convert the selected thread detail view into a chat-style timeline, move primary lane quick links into the top header, add bottom-anchored scrolling plus a right-side navigation rail, and implement live-plus-lazy stderr loading with cleanup so long-running threads do not overflow client memory while existing approval and feedback flows remain intact.
- Preserve a reviewable OpenSpec contract before coding starts.
- Keep the proposal logical enough that any pooled worker can execute it.
- Reuse a managed worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` for cache-friendly execution.

**Non-Goals:**
- Bind this proposal to a specific branch or worker slot before approval.
- Expand scope beyond the approved proposal without human feedback.
- Merge sibling proposals into a single coding pass without replanning.

## Decisions

- Store the proposal as a dedicated OpenSpec change before coding begins.
- Let the pooled coding-review runtime allocate execution branches and worktrees after approval.
- Use planner output as the starting point for reviewer validation and follow-up tasks.
- Prefer incremental implementation that can be requeued after machine review feedback.
- Keep the canonical request/PR title as `feat: Rework Thread Tab Into Chat Timeline`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `feat` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `feat: Rework Thread Tab Into Chat Timeline`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: One proposal is the right shape for this request. The layout shift, timeline model, stderr streaming behavior, and navigation changes are tightly coupled; splitting them would create partial approvals that do not satisfy the requested thread-tab rework. Suggested OpenSpec change name: `thread-tab-chat-layout` Implementation scope: 1. Rework the selected thread detail view from the current sectioned dashboard into a chat-style timeline shell. The high-value lane metadata should move into a compact top header link group, matching the requested pattern such as pool slot, run count, revision count, PR link, and branch link. 2. Derive one primary lane for that header strip from the latest meaningful worker lane state rather than trying to show every proposal at once. Recommended rule: prefer the most recently updated non-idle lane with branch or PR data; fall back to the newest assigned lane, then to thread-level metadata if none exists. 3. Replace the current thread-detail log presentation with a unified timeline-oriented activity model for the thread view. That timeline should cover persisted human messages, agent steps, assignment and lane milestones, and stderr blocks in chronological order while preserving the existing approval and feedback actions. 4. Extend the thread log data path beyond the current `GET /api/team/logs?threadId&limit` tail-only behavior. The backend currently reads the whole JSONL file and returns the last N entries, which is not sufficient for true lazy stderr history loading. This proposal should add cursor- or anchor-based fetching for recent tail polling plus older stderr page retrieval. 5. Implement stderr behavior specifically for long-running threads: keep the newest stderr block live and expanded, keep older stderr blocks folded by default, fetch older folded content only when expanded, and discard invisible expanded stderr content back to lightweight summaries so React state does not grow without bound. 6. Add bottom-anchored scrolling behavior for the thread timeline. On open, the view should land at the bottom. While the user remains pinned near the tail, new activity should keep the view at the bottom; once the user scrolls away, auto-jumping should stop. 7. Add a right-side navigation rail for major timeline anchors and a scroll-to-top control that appears only when the content is scrollable and the user is away from the top. The rail should target meaningful sections or milestones, not every individual log line. 8. Keep the existing live run console stable. `TeamThreadLogPanel` is shared today between the console and the thread detail view, so the implementation should either preserve console behavior while extending it or split the thread-detail timeline viewer into its own component to avoid regressions. 9. Update styling in `app/globals.css` for the new chat-style thread layout on desktop and mobile without disturbing the broader workspace shell. Likely implementation surfaces: - `components/thread-detail-panel.tsx` - `components/thread-log-panel.tsx` or a new thread-detail-specific timeline component - `components/thread-view-utils.ts` - `app/api/team/logs/route.ts` - `lib/team/logs.ts` - `app/globals.css` - supporting tests and API docs as needed Acceptance target: - The selected thread opens into a chat-style timeline. - The header shows the quick-link strip for the primary lane, including corrected `meow-N` pool-slot copy where applicable. - The newest stderr stays live, older stderr stays folded until requested, and older hidden stderr content does not accumulate indefinitely in memory. - The view starts at the bottom, supports right-rail navigation, and exposes a scroll-to-top control only when useful. - Existing approval, feedback, and polling flows still work. Validation target: - Add or update pure helper tests for lane selection, log pagination/windowing, and grouping logic where practical. - Run `pnpm lint`. - Run `pnpm build` before handoff because this change crosses shared UI and API boundaries. Assumptions and risks: - The requested header quick-link strip is assumed to summarize one primary lane, not all proposals simultaneously. If product wants explicit per-lane switching in the header, that is a follow-up clarification. - Real lazy stderr loading requires backend query changes; a client-only fold/unfold would not satisfy the memory-overflow concern. - The current lane cards display `moew-N`; this proposal should normalize surfaced pool-slot text to `meow-N` in the new header treatment. - Coding-review work should not start until a human approves this single proposal.
