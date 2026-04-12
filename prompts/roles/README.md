# Role Prompts

Keep one `*.prompt.md` module per role plus a matching entry in
`prompts/roles/index.ts`. The filename becomes the role ID and the YAML
frontmatter provides the static title and summary metadata.

Examples:

- `planner.prompt.md`
- `coder.prompt.md`
- `reviewer.prompt.md`
- `researcher.prompt.md`

When you add or rename a role prompt:

1. Create the `*.prompt.md` file with `title` and `summary` frontmatter.
2. Register the prompt module in `prompts/roles/index.ts`.
3. Run `pnpm meow-prompt:sync-types` so TypeScript picks up the generated
   declaration file.

To activate a role, add its role ID to the `workflow` array in
[`team.config.ts`](/home/kamiyoru/work/ts/meow-team/team.config.ts).
