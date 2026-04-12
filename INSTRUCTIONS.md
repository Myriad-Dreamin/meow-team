# Project Instructions

## Purpose

Build a clean Codex CLI-based engineering harness where one owner configures a
small continuous team and runs it through a simple web interface.

## Non-Negotiable Rules

- Use English for all project content, code comments, docs, and UI copy.
- Keep the stack full TypeScript with pure Next.js App Router.
- Use `pnpm` for dependency and script management.
- Build the multi-agent workflow around Codex CLI structured runs, repo-local
  skills, and deterministic orchestration in application code.
- Use Codex through the configured OpenAI-compatible backend for the default
  model configuration.

## Product Direction

- The default supported roles are:
  - `planner`
  - `coder`
  - `reviewer`
- Additional roles should be easy to add through `lib/team/roles/*.prompt.md` modules, matching role code under `lib/team/roles`, and `pnpm meow-prompt:sync-types`.
- Team ownership should be defined in a single configuration file.
- The team should support continuous runs by persisting thread history.

## Engineering Notes

- Prefer deterministic code-based routing over opaque agent-to-agent autonomy.
- Keep role prompts colocated with the role implementations in `lib/team/roles`.
- Keep team configuration in `team.config.ts`.
- Keep API routes thin and push harness logic into `lib/team`.
- Treat the reviewer role as a real review pass focused on bugs, regressions,
  and missing tests.
