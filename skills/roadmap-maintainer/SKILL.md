---
name: roadmap-maintainer
description: Update repository roadmap docs with alias-aware roadmap/topic lookup and preserve archived spec links.
---

Use this skill when the request touches `docs/roadmap`, roadmap/topic planning
notes, or any workflow that maps conventional-title scope to roadmap docs.

## Source Of Truth

- Roadmap docs live under `docs/roadmap/`.
- The repository entry point is `docs/roadmap/index.md`.
- Each roadmap lives at `docs/roadmap/<roadmap>/index.md`.
- Each topic lives at `docs/roadmap/<roadmap>/<topic>.md`.

## Naming And Aliases

- Roadmap folders and topic files use kebab-case slugs.
- Optional short aliases live in YAML frontmatter under `aliases`.
- Resolve a roadmap by folder slug first, then any alias declared in
  `docs/roadmap/<roadmap>/index.md`.
- Resolve a topic by file slug first, then any alias declared in that topic
  file.
- Scope strings should use `roadmap/topic`, for example `vsc/command`.

## Authoring Rules

1. Read `docs/roadmap/index.md` before editing a roadmap topic.
2. Keep roadmap index files focused on:
   - one `#` title
   - a brief note describing the roadmap and how its topics relate
   - concise design notes or philosophy
   - links to topic files
3. Keep topic files focused on:
   - one `#` title
   - `##` sections for concrete feature/task themes
   - a final `## Related Specs` section
4. When adding archived spec references, append Markdown bullet links inside
   `## Related Specs` and avoid duplicates.
5. Keep prose in English.

## Expected Workflow

1. Resolve the roadmap/topic slug or alias from the request or conventional
   title scope.
2. Open the matching roadmap index and topic file.
3. Update the roadmap narrative or topic sections with minimal, concrete edits.
4. Preserve `## Related Specs` as the last topic section.
