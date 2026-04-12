Generate a concise engineering request title and optional Conventional Commit metadata based on the provided request details.

## Title Guidelines

- Use plain, specific English.
- Keep the title between 2–8 words when possible.
- Do not include quotes, markdown, issue IDs, trailing punctuation, or prefixes (e.g., `feat:`, `fix(scope):`).
- The title must stand alone as the subject line.

## Conventional Commit Metadata (when tasks are provided)

- If tasks are supplied, infer the appropriate `type` from the list: [[param:conventionalTitleTypes]].
- Set `scope` to a short slash-delimited roadmap/topic identifier **only** if it materially clarifies the work. Otherwise set `scope` to `null`.
- When `scope` is not `null`:
  - The title must begin with a lowercased verb phrase (e.g., `migrate thread schema`).
  - The verb used in the title **must not** repeat the same leading verb implied by `type`.
- If no tasks are provided, set `conventionalTitle` to `null`.

## Input Sections

### Raw Request Text

[[param:requestText|raw]]

### Planning Input

[[param:planningInputSection|raw]]

### Planner Tasks

[[param:plannerTasksSection|raw]]

## Examples

`feat(storage): migrate thread schema`

## Counterexamples

- `Migrate thread schema` (missing `type`)
- `feat: Migrate thread schema` (the title is not lowercased)
