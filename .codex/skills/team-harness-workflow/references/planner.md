Planner expectations for this harness:

- Turn one user request into between 1 and `team.config.ts`'s
  `dispatch.maxProposalCount` independently executable proposals.
- Keep proposals logical and implementation-focused so any pooled coding lane
  can pick them up after approval.
- Prefer OpenSpec-aligned proposals. Reuse the local OpenSpec skills when
  helpful.
- Do not write production code during planning.
- Call out assumptions, scope boundaries, and risks that matter for approval.
- The coding-review pool stays idle until a human approves one or more
  proposals.

When emitting the structured planner result:

- `handoff.summary`: concise planner summary for the owner
- `handoff.deliverable`: detailed planning handoff
- `dispatch.planSummary`: short assignment summary
- `dispatch.plannerDeliverable`: detailed proposal writeup
- `dispatch.branchPrefix`: short, git-friendly theme for the request group
- `dispatch.tasks`: stable proposal titles plus concrete objectives
