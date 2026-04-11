## Why

Introduce the `docs/roadmap` structure, a repo-local roadmap skill with alias-aware guidance, docs navigation updates, and deterministic final-archive updates that append archived OpenSpec spec links into the matching roadmap topic's `## Related Specs` section. Add a roadmap documentation and archive-linking concept on top of the existing roadmap/topic scope metadata. This proposal is one candidate implementation for the request: Add roadmap concept: - roadmap and topics names are in kebab-case, and has an optional short alias, e.g. `vsc` for `vscode-extension`. - The roadmap are stored in `docs/roadmap/`, and the entry point is in `docs/roadmap/index.md`. - Use a roadmap skill to update the roadmap, for example `docs/roadmap/vscode-extension/index.md`. - the roadmap is arranged as following: - A section with `#` title and a brief note about which topics are followed and relation of topics, a brief design notes and phylosophy of the roadmap. - The topic are discussed in the sub-file `docs/roadmap/vscode-extension/some-topic.md` and linked in the main file `docs/roadmap/vscode-extension/index.md`. - The topic file starts with a `#` title, and each section is a feature or task. - The last section of topic file is a `## Related Specs` section which links to the specs that are related to the topic. - When an openspec archived is made, append the name of the openspec to the `## Related Specs` in a topic of roadmap.

## What Changes

- Introduce the `roadmap-concept-a1-p1-add-roadmap-concept-and-archive-linking` OpenSpec change for proposal "Add Roadmap Concept and Archive Linking".
- Introduce the `docs/roadmap` structure, a repo-local roadmap skill with alias-aware guidance, docs navigation updates, and deterministic final-archive updates that append archived OpenSpec spec links into the matching roadmap topic's `## Related Specs` section.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `roadmap-concept-a1-p1-add-roadmap-concept-and-archive-linking`: Introduce the `docs/roadmap` structure, a repo-local roadmap skill with alias-aware guidance, docs navigation updates, and deterministic final-archive updates that append archived OpenSpec spec links into the matching roadmap topic's `## Related Specs` section.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `feat(roadmap): Add Roadmap Concept and Archive Linking`
- Conventional title metadata: `feat(roadmap)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Single OpenSpec-aligned proposal. Suggested OpenSpec seed: roadmap-concept. Implement a repository roadmap system rooted at `docs/roadmap/index.md`, create per-roadmap and per-topic markdown files with optional alias support, add a repo-local roadmap skill for agent-authored updates, expose that skill in harness prompt context, and wire final OpenSpec archival to append the archived change name as a `## Related Specs` link in the resolved roadmap topic. Reuse the existing slash-delimited conventional title scope as the deterministic roadmap/topic locator, keep it out of branch prefixes and OpenSpec change paths, and cover alias resolution plus archive-update failure modes with tests. Coding-review lanes remain idle until this proposal is approved.
