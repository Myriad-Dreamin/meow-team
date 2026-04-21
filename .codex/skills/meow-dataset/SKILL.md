---
name: meow-dataset
description: Use when creating, updating, generating, validating, or reviewing Meow dataset packages and dataset output paths. Covers git config dataset path discovery, tmp log locations, pnpm package layout under project/dataset by dataset name, TypeScript generation and validation scripts, and dataset maintenance commands.
---

Work with repository-local dataset packages and their configured generated data
locations.

## Path Discovery

- Resolve the temporary workspace with `git config --get dataset.tmp`.
- Treat logs as belonging under `<dataset.tmp>/logs/`; create that directory
  before writing generation or validation logs.
- If `dataset.tmp` is unset or empty, ask the user for a path. After they
  provide one, persist it with `git config --local dataset.tmp <path>`.
- List configured dataset paths with `git config --get-regexp dataset`.
- Treat `dataset.tmp` as shared temporary/log configuration, not as a named
  dataset package.
- Resolve a named dataset data path with
  `git config --get dataset.<dataset-name>`.
- If `dataset.<dataset-name>` is unset, ask the user for the dataset data path.
  After they provide one, persist it with
  `git config --local dataset.<dataset-name> <path>`.
- Do not guess missing data paths. Prefer absolute paths, or repository-relative
  paths only when the user explicitly provides them.

## Dataset Package Layout

- Keep each dataset source package at `project/dataset/<dataset-name>/`.
- Make the dataset package a pnpm-managed NPM package.
- Name the package `dataset-<dataset-name>` in `package.json`.
- Store generated dataset files in the path from
  `git config --get dataset.<dataset-name>`, not by hard-coding output paths.
- Put generation scripts in `src/gen/`.
- Put validation scripts in `src/validate/`.
- Put shared helpers in `src/`.
- Prefer TypeScript for generation, validation, and shared scripts.
- Allow dataset packages to depend on other repository workspace packages with
  pnpm workspace dependencies when needed.
- If a dataset package uses `workspace:*` dependencies, ensure the repository
  pnpm workspace includes `project/dataset/*` or another pattern that covers
  the package.
- Keep `README.md` in the dataset package and describe how to generate,
  validate, inspect, and refresh the dataset.
- Keep `package.json` scripts as the main maintenance entry points; use
  `pnpm --dir project/dataset/<dataset-name> <script>` from the repo root.

## Maintenance Workflow

1. Resolve `dataset.tmp` and the target `dataset.<dataset-name>` paths before
   editing or running dataset scripts.
2. Inspect `project/dataset/<dataset-name>/README.md` for dataset-specific
   generation instructions.
3. Inspect `project/dataset/<dataset-name>/package.json` for available
   maintenance scripts.
4. Generate or update scripts under `src/gen/` so they write to the configured
   dataset path.
5. Generate or update validators under `src/validate/` so they verify the
   configured dataset path.
6. Write run logs under `<dataset.tmp>/logs/` with clear names such as
   `<dataset-name>-gen-<timestamp>.log` or
   `<dataset-name>-validate-<timestamp>.log`.
7. Run the smallest package script that proves the change, then broader
   validation when data format or generation logic changes.
8. Summarize output paths, scripts run, log paths, and validation results in the
   handoff.

## Script Expectations

- Read `dataset.<dataset-name>` with `git config --get` at runtime or pass it
  through a package script environment variable that is computed from git
  config.
- Fail fast when required config is missing, and print the exact
  `git config --local ...` command the user should run.
- Keep generation scripts deterministic when inputs are unchanged.
- Keep validation scripts side-effect free except for logs or temporary files
  under `dataset.tmp`.
- Prefer package scripts such as `gen`, `validate`, `clean`, and `summary`.
- Do not commit generated data unless the dataset package README or user
  request says it is tracked.

## Example

For dataset name `revival`:

```bash
git config --get dataset.tmp
git config --local dataset.tmp /tmp/meow-datasets

git config --get dataset.revival
git config --local dataset.revival /tmp/meow-datasets/revival

git config --get-regexp dataset
```

Package source layout:

```text
project/dataset/revival/
├── README.md
├── package.json
└── src/
    ├── config.ts
    ├── gen/
    │   └── build.ts
    └── validate/
        └── check.ts
```

Example `package.json`:

```json
{
  "name": "dataset-revival",
  "private": true,
  "type": "module",
  "scripts": {
    "gen": "tsx src/gen/build.ts",
    "validate": "tsx src/validate/check.ts",
    "refresh": "pnpm run gen && pnpm run validate"
  },
  "dependencies": {
    "@meow-team/cli": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.20.0",
    "typescript": "^5.9.0"
  }
}
```

Example shared config helper:

```ts
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

function gitConfig(key: string): string {
  return execFileSync("git", ["config", "--get", key], {
    encoding: "utf8",
  }).trim();
}

export function datasetPath(name: string): string {
  return gitConfig(`dataset.${name}`);
}

export function logPath(name: string, phase: "gen" | "validate"): string {
  const logsDir = join(gitConfig("dataset.tmp"), "logs");
  mkdirSync(logsDir, { recursive: true });
  return join(logsDir, `${name}-${phase}-${Date.now()}.log`);
}
```

Example package README content:

```markdown
# Revival Dataset

Generated files are written to `git config --get dataset.revival`.
Logs are written to `$(git config --get dataset.tmp)/logs/`.

Run `pnpm --dir project/dataset/revival gen` to generate data.
Run `pnpm --dir project/dataset/revival validate` to validate data.
Run `pnpm --dir project/dataset/revival refresh` to regenerate and validate.
```
