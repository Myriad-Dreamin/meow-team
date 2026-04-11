## Why

Remove webpack-only support and the standalone template-sync CLI, generate prompt declaration files from the Vite lifecycle, replace custom frontmatter parsing with `stripYamlFrontmatter` plus `js-yaml`, and update configs/tests so typed prompt imports still work across Next, Vitest, and TypeScript. Single proposal to simplify `meow-prompt` build integration and YAML frontmatter parsing. This proposal is one candidate implementation for the request: Improve `meow-prompt`: - remove webpack support. - sync-template-types.ts is removed and the template types are synced during vite build (like `astro build`). - extract yaml based on following parser and parse yaml using `js-yaml`: ```ts function stripYamlFrontmatter(markdown: string): { frontmatter: string | null; body: string; } { if (!markdown.startsWith("---")) { return { frontmatter: null, body: markdown }; } const lines = markdown.split(/\r?\n/); if (lines[0].trim() !== "---") { return { frontmatter: null, body: markdown }; } let end = -1; for (let i = 1; i < lines.length; i++) { if (lines[i].trim() === "---") { end = i; break; } } if (end === -1) { return { frontmatter: null, body: markdown }; } const frontmatter = lines.slice(1, end).join("\n"); const body = lines.slice(end + 1).join("\n"); return { frontmatter, body }; } ```.

## What Changes

- Introduce the `meow-prompt-build-a1-p1-simplify-meow-prompt-build-pipeline-and-yaml-fro` OpenSpec change for proposal "Simplify meow-prompt build pipeline and YAML frontmatter".
- Remove webpack-only support and the standalone template-sync CLI, generate prompt declaration files from the Vite lifecycle, replace custom frontmatter parsing with `stripYamlFrontmatter` plus `js-yaml`, and update configs/tests so typed prompt imports still work across Next, Vitest, and TypeScript.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `meow-prompt-build-a1-p1-simplify-meow-prompt-build-pipeline-and-yaml-fro`: Remove webpack-only support and the standalone template-sync CLI, generate prompt declaration files from the Vite lifecycle, replace custom frontmatter parsing with `stripYamlFrontmatter` plus `js-yaml`, and update configs/tests so typed prompt imports still work across Next, Vitest, and TypeScript.

### Modified Capabilities
- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Create one OpenSpec change seeded as `simplify-meow-prompt-build-and-frontmatter`. Execution intent: - Remove webpack-only build and loader paths from `meow-prompt` and the repo scripts that still force webpack. - Fold prompt declaration syncing into the Vite plugin lifecycle so the separate `sync-template-types` implementation and script can be removed. - Replace custom frontmatter parsing with the requested `stripYamlFrontmatter` behavior and parse the extracted YAML via `js-yaml`. - Update tests, fixtures, and config so typed prompt imports continue to work in the app, Vitest, and TypeScript validation flows. Approval-sensitive points: - The coder should treat preserving typed imports outside pure Vite builds as a hard requirement. - If removing webpack support would also require changing current Next/Turbopack prompt loading semantics, that should be surfaced during implementation rather than expanded implicitly. - Coding and review lanes remain idle until human approval arrives.
