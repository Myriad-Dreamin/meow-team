## Why

Implement an end-to-end request title field for the harness: accept an optional human title, generate a concise fallback title through the existing LLM execution path when absent, persist it as mutable request-group metadata separate from all canonical IDs, and display it in the active thread UI without removing the underlying request text. Add mutable request titles with LLM fallback and UI surfacing. This proposal is one candidate implementation for the request: Implement that: if a request doesn't have a title, decide it by LLM. title may be changed later so is not same as id.

## What Changes

- Introduce the `request-title-a1-p1-support-mutable-request-titles-with-llm-fallback` OpenSpec change for proposal "Support Mutable Request Titles with LLM Fallback".
- Implement an end-to-end request title field for the harness: accept an optional human title, generate a concise fallback title through the existing LLM execution path when absent, persist it as mutable request-group metadata separate from all canonical IDs, and display it in the active thread UI without removing the underlying request text.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities

- `request-title-a1-p1-support-mutable-request-titles-with-llm-fallback`: Implement an end-to-end request title field for the harness: accept an optional human title, generate a concise fallback title through the existing LLM execution path when absent, persist it as mutable request-group metadata separate from all canonical IDs, and display it in the active thread UI without removing the underlying request text.

### Modified Capabilities

- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: OpenSpec-aligned proposal: 1. Add optional request title input and storage. - Update the run API and client contract to accept an optional title. - Persist the latest request title separately from request identity so title changes never affect `threadId`, `assignmentNumber`, branches, or proposal IDs. 2. Generate a fallback title through the existing LLM path. - Reuse current Codex structured-output plumbing instead of introducing a separate model stack. - Only auto-generate when the caller omits a title; keep human-supplied titles unchanged. - Add a deterministic fallback when the generated title is empty or invalid. 3. Surface the title throughout the active request flow. - Show the title in the planning console and live thread status cards. - Keep the raw request text visible below it so the generated title does not hide original intent. 4. Keep replanning coherent. - Preserve the stored title through approval, feedback, and replanning flows for the same request group unless intentionally replaced. 5. Validate. - Run `pnpm lint` after the change and `pnpm build` before handoff if the implementation touches multiple integration points. This is one coherent proposal; approving it should materialize a single OpenSpec change focused on request metadata, title generation, and display.
