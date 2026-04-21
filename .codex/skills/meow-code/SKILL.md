---
name: meow-code
description: Use when the user starts an interactive-mode request with `/meow-code`; run the current coder workflow against the latest plan and optional suggestion.
---

Run the coder role manually inside an interactive Codex session.

## Command Contract

- Syntax: `/meow-code [optional-suggestion]`
- The optional suggestion refines the latest plan or current implementation
  target.
- The user communicates with the main agent. Work directly in the current
  checkout unless the user explicitly points to another worktree.

## Steps

1. Strip the `/meow-code` prefix. Treat any remaining text as implementation
   guidance.
2. Apply the inline coder role, harness workflow, and lane rules in this skill.
3. Use the latest `/meow-plan` handoff, approved OpenSpec change, or visible
   conversation context as the implementation source of truth. If no actionable
   target exists, ask the user for one instead of guessing.
4. Make concrete, focused repository changes. Keep implementation minimal,
   maintainable, and aligned with repository style.
5. Use `pnpm` for scripts. Run focused validation when practical, then broader
   validation when the change is structural or integration-heavy.
6. Do not finish with conceptual guidance alone. Leave a reviewable workspace
   state before handing off.

## Inline Implementation Sources

### Coder Role

Implement the plan as the execution owner for the assignment.

Focus on:

- the most direct implementation path
- keeping changes coherent and maintainable
- making concrete repository changes before requesting review
- explaining what changed in practical engineering language
- listing follow-up work or remaining tradeoffs
- staying within the approved branch and worktree when the project uses
  dedicated lanes

When the planner or reviewer asks for adjustments, incorporate them into a
revised implementation handoff instead of re-explaining the whole system. Do
not ask for review with conceptual guidance alone; leave a reviewable workspace
state first.

Coder execution rules:

- Operate inside the branch and worktree assigned by the current project when
  those are provided.
- Use Codex CLI native repository tools and shell access to inspect, edit, and
  validate work.
- If you author a direct commit, use a lowercase conventional subject such as
  `docs:`, `fix:`, `test:`, or `dev:`.
- Produce concrete repository changes before finishing.
- Finish with an implementation handoff after reviewable output exists.

### Harness Workflow

Use this skill whenever Codex is running the implementation step of a Meow-style
engineering harness in the current project.

Shared expectations:

- Use project-local skills when they fit, especially tracked-change or OpenSpec
  skills when the project has them.
- Use `pnpm` for validation and package commands when the project is a
  TypeScript/pnpm workspace.
- Keep final outputs concrete and structured for downstream review or
  persistence.

### Lane Rules

Lane expectations:

- Stay inside the dedicated branch and reusable worktree for the current lane
  when the project assigns them.
- Treat the approved proposal plus prior handoffs as the source of truth.
- Leave concrete repository state behind. Do not finish with conceptual advice
  alone.
- Use Codex CLI native repository tools and shell access instead of custom app
  tools.
- Run the smallest validation that proves the change, and run broader
  validation after meaningful or structural code edits when feasible.

Coder lane guidance:

- Implement the direct path that satisfies the proposal.
- Summarize what changed, what was validated, and any follow-up tradeoffs.
- Finish only after the branch or workspace is reviewable.

Reviewer handoff awareness:

- Implementation output should be ready for a bug-focused review that checks
  regressions, missing validation, and missing tests.
- If follow-up work remains, make it explicit and actionable in the handoff.

## Output

Return a concise coder handoff:

- Files or areas changed.
- Practical implementation notes.
- Validation commands run and results.
- Follow-up tradeoffs or blockers, if any.
- Suggested next command, usually `/meow-review`.
