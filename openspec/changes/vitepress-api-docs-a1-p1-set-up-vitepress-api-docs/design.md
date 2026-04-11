## Context

This change captures proposal "Set up VitePress API docs" as OpenSpec change `vitepress-api-docs-a1-p1-set-up-vitepress-api-docs`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Add a VitePress site rooted at `docs/`, create the initial API landing and endpoint reference pages for the existing `app/api/team` routes, and annotate each route file with a header that points to its corresponding documentation page.
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

Planner deliverable reference: Proposal: `Set up VitePress API docs` Suggested OpenSpec seed: `vitepress-api-docs-a1-p1-bootstrap-api-doc-site` Objective: Bootstrap VitePress documentation for this repository with `docs/index.md` as the entry point, introduce the first API documentation pages, and create a maintainable mapping between `app/api` route files and their markdown references. Implementation shape: - Add VitePress to the repo and define root `pnpm` scripts for local docs development and docs build. - Create `docs/.vitepress/config.ts` with minimal config, nav, and sidebar support for the initial API docs. - Create `docs/index.md` and `docs/api.md` as the initial top-level docs pages. - Create `docs/api/index.md` and route-specific API markdown files for the current `app/api/team/**` handlers, using mirrored paths where practical and a clear convention for dynamic segments. - Add a short English note header to every `app/api/**/route.ts` file that points to its corresponding doc page. - Keep the change documentation-focused; do not refactor route logic except for harmless comment/header additions. Validation: - `pnpm fmt` - `pnpm fmt:check` - `pnpm lint` - `pnpm build` - `pnpm docs:build` or `pnpm exec vitepress build docs` Non-goals: - No generated OpenAPI or schema export. - No automatic doc syncing from code annotations. - No broader docs expansion beyond the current API endpoints. Assumptions and risks: - Treat `docs/api/path.md` as a path pattern, not a single shared markdown file, so each existing endpoint can have a concrete reference page. - Confirm a VitePress-safe naming convention for `app/api/team/threads/[threadId]/route.ts` before implementation finalization. Approval note: one proposal only. Coding and review lanes should stay idle until approval.
