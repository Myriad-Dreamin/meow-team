# GitHub Module

This module powers the Earth Online launcher's GitHub gameplay loop.

## Current Gameplay Scope

- Event Stream:
  - Records system and user-triggered events for the left-side UI feed.
  - Supports `notification` events for highlighted timeline moments.
- Issue Tasks:
  - Right-side task board is currently scoped to GitHub Issues only.
  - Every task is stored with source `github-issue`.
- Achievements:
  - Progress increases from event activity and issue-task completion.
  - Unlock state is recomputed after each mutation.
- REPL:
  - Supports text commands and completion suggestions.
  - Commands can create events, create issue tasks, complete tasks, and inspect state.

## Architecture

- `types.ts`
  - Shared domain types and default module state.
- `store.ts`
  - Persistence layer for `data/github-module.json`.
- `service.ts`
  - Core business logic for events, tasks, achievements, and REPL.
- `api.ts`
  - HTTP handler layer used by `app/api/github/*` route wrappers.

## API Wrapper Policy

`app/api/github/*` routes should stay as thin wrappers that only expose runtime and forward requests to handlers in this module. Main behavior must remain inside `lib/github-module`.
