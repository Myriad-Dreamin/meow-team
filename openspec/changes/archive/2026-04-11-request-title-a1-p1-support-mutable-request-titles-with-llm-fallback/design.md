## Context

This change captures proposal "Support Mutable Request Titles with LLM Fallback" as OpenSpec change `request-title-a1-p1-support-mutable-request-titles-with-llm-fallback`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**

- Implement an end-to-end request title field for the harness: accept an optional human title, generate a concise fallback title through the existing LLM execution path when absent, persist it as mutable request-group metadata separate from all canonical IDs, and display it in the active thread UI without removing the underlying request text.
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

## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: OpenSpec-aligned proposal: 1. Add optional request title input and storage. - Update the run API and client contract to accept an optional title. - Persist the latest request title separately from request identity so title changes never affect `threadId`, `assignmentNumber`, branches, or proposal IDs. 2. Generate a fallback title through the existing LLM path. - Reuse current Codex structured-output plumbing instead of introducing a separate model stack. - Only auto-generate when the caller omits a title; keep human-supplied titles unchanged. - Add a deterministic fallback when the generated title is empty or invalid. 3. Surface the title throughout the active request flow. - Show the title in the planning console and live thread status cards. - Keep the raw request text visible below it so the generated title does not hide original intent. 4. Keep replanning coherent. - Preserve the stored title through approval, feedback, and replanning flows for the same request group unless intentionally replaced. 5. Validate. - Run `pnpm lint` after the change and `pnpm build` before handoff if the implementation touches multiple integration points. This is one coherent proposal; approving it should materialize a single OpenSpec change focused on request metadata, title generation, and display.
