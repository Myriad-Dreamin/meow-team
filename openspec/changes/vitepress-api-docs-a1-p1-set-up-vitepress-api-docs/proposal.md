## Why

Add a VitePress site rooted at `docs/`, create the initial API landing and endpoint reference pages for the existing `app/api/team` routes, and annotate each route file with a header that points to its corresponding documentation page. Initialize a VitePress site in `docs/`, add the first API reference pages for the existing `app/api/team` endpoints, and annotate each API route file with its matching doc link. This proposal is one candidate implementation for the request: Initialize doc site using vitepress: - use `docs` as the doc folder, and use `docs/index.md` as the entry point. - the only docs is `docs/api.md` for now, and APIs in `app/api` are documented in `docs/api/index.md` and `docs/api/path.md`. - Adds note header in each file of `app/api` to indicate the file has corresponding API doc in `docs/api/path.md`.

## What Changes

- Introduce the `vitepress-api-docs-a1-p1-set-up-vitepress-api-docs` OpenSpec change for proposal "Set up VitePress API docs".
- Add a VitePress site rooted at `docs/`, create the initial API landing and endpoint reference pages for the existing `app/api/team` routes, and annotate each route file with a header that points to its corresponding documentation page.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities

- `vitepress-api-docs-a1-p1-set-up-vitepress-api-docs`: Add a VitePress site rooted at `docs/`, create the initial API landing and endpoint reference pages for the existing `app/api/team` routes, and annotate each route file with a header that points to its corresponding documentation page.

### Modified Capabilities

- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: `Set up VitePress API docs` Suggested OpenSpec seed: `vitepress-api-docs-a1-p1-bootstrap-api-doc-site` Objective: Bootstrap VitePress documentation for this repository with `docs/index.md` as the entry point, introduce the first API documentation pages, and create a maintainable mapping between `app/api` route files and their markdown references. Implementation shape: - Add VitePress to the repo and define root `pnpm` scripts for local docs development and docs build. - Create `docs/.vitepress/config.ts` with minimal config, nav, and sidebar support for the initial API docs. - Create `docs/index.md` and `docs/api.md` as the initial top-level docs pages. - Create `docs/api/index.md` and route-specific API markdown files for the current `app/api/team/**` handlers, using mirrored paths where practical and a clear convention for dynamic segments. - Add a short English note header to every `app/api/**/route.ts` file that points to its corresponding doc page. - Keep the change documentation-focused; do not refactor route logic except for harmless comment/header additions. Validation: - `pnpm fmt` - `pnpm fmt:check` - `pnpm lint` - `pnpm build` - `pnpm docs:build` or `pnpm exec vitepress build docs` Non-goals: - No generated OpenAPI or schema export. - No automatic doc syncing from code annotations. - No broader docs expansion beyond the current API endpoints. Assumptions and risks: - Treat `docs/api/path.md` as a path pattern, not a single shared markdown file, so each existing endpoint can have a concrete reference page. - Confirm a VitePress-safe naming convention for `app/api/team/threads/[threadId]/route.ts` before implementation finalization. Approval note: one proposal only. Coding and review lanes should stay idle until approval.
