---
name: meow-plan
description: Use when the user starts an interactive-mode request with `/meow-plan`; run the current planner workflow against the provided content without editing production code.
---

Run the planner role manually inside an interactive Codex session.

## Command Contract

- Syntax: `/meow-plan content`
- `content` is required and is the planning request.
- The user communicates with the main agent. Do not start background lanes or
  assume the web harness will advance automatically.
- If user says `/execute`, `/benchmark`, `/debug`, execute mode is implied, i.e. following skill will be `/meow-execute` instead of `/meow-code`.

## Steps

1. Strip the `/meow-plan` prefix and treat the remaining content as the current
   planning request. If it is empty, ask the user for the request before
   continuing.
2. Apply the inline planner role, harness workflow, proposal-shaping rules, and
   planning-helper guidance in this skill. If the current project ships its own
   tracked-change workflow, prefer that workflow while keeping the same planning
   constraints.
3. Prefer project-local planning helpers when the request should become a
   tracked change or when the user wants to explore options without
   implementing.
4. Plan only. Do not write production code, run destructive commands, or
   implement the plan during this command.
5. Produce a planner handoff that the user can approve or refine before running
   `/meow-code` or `/meow-execute`.

## Inline Planning Sources

### Planner Role

Turn the latest user request into a crisp proposal set that the rest of the
team can execute after human approval.

Requirements:

- use tracked-change or proposal skills whenever possible
- prefer a single implementation proposal by default
- only create multiple proposals when the request clearly benefits from
  separate, independently reviewable options or workstreams
- keep each proposal logically scoped so any pooled coding-review worker can
  execute it once approved
- stop after proposal creation and wait for human approval or feedback

Focus on:

- the concrete objective
- scope boundaries
- when multiple proposals are actually warranted, the proposal options and
  implementation sequence
- any assumptions or open risks
- where coding-review lanes should stay idle until human approval arrives

Keep the plan practical. Avoid writing production code. The handoff should be
clear enough that a coder can act without re-planning the whole task.

Planner execution rules:

- Create a practical engineering plan and split it into between one and the
  project's configured maximum number of proposals when the project uses a
  repository-backed dispatch flow.
- Keep proposals logical and implementation-focused. Do not describe them as
  tied to a specific branch or worker slot.
- Align each proposal with the local tracked-change flow so the project can
  materialize a real change artifact when that workflow exists.
- Use a short, git-friendly request-group theme when the project expects branch
  naming metadata.
- If no repository or dispatch target is selected, explain that dispatch is
  blocked and omit dispatch details.

### Harness Workflow

Use this skill whenever Codex is running the planning step of a Meow-style
engineering harness in the current project.

Shared expectations:

- Use project-local skills when they fit, especially tracked-change or OpenSpec
  skills when the project has them.
- Use `pnpm` for validation and package commands when the project is a
  TypeScript/pnpm workspace.
- Keep final outputs concrete and structured for downstream review or
  persistence.

### Proposal Shaping Rules

- Turn one user request into between one and the project's maximum number of
  independently executable proposals.
- Prefer a single proposal by default. Only split the request when clearly
  separable chunks improve approval clarity, sequencing, or implementation
  safety.
- Even when there is only one preferred path, still treat it as an item in the
  proposal list so the owner can review it consistently.
- Keep proposals logical and implementation-focused so any pooled coding lane
  can pick them up after approval.
- Prefer tracked-change-aligned proposals when the project supports them.
- Do not write production code during planning.
- Call out assumptions, scope boundaries, and risks that matter for approval.
- The coding-review pool stays idle until a human approves one or more
  proposals.

When emitting a structured planning result:

- `handoff.summary`: concise planner summary for the owner
- `handoff.deliverable`: detailed planning handoff
- `dispatch.planSummary`: short assignment summary when dispatch exists
- `dispatch.plannerDeliverable`: detailed proposal writeup
- `dispatch.branchPrefix`: short, git-friendly theme for the request group when
  branch metadata exists
- `dispatch.tasks`: stable proposal titles plus concrete objectives

### Planning Helper Guidance

When the project includes a proposal-creation helper:

- treat it as the fast path for turning a user request into tracked change
  artifacts
- gather enough input to understand what the user wants to build
- create or update the change name and artifacts needed before implementation
- stop once the proposal, design, and task-level planning artifacts are ready

When the project includes an explore-mode helper:

- use it for thinking, not implementation
- ask clarifying questions, compare options, and map risks
- inspect the codebase when useful
- use diagrams or structured comparisons when they improve understanding
- offer to capture decisions in proposal, design, spec, or task artifacts
  without implementing production code

## Output

Return a concise interactive planning handoff:

- Summary of the recommended path.
- Assumptions, scope boundaries, and meaningful risks.
- One preferred implementation proposal by default.
- Multiple proposals only when they are genuinely independent or improve safety.
- Suggested next command, usually `/meow-code` for implementation or
  `/meow-execute` for execution-mode work.
