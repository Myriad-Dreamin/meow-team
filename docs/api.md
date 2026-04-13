---
title: API Guide
outline: deep
---

# API guide

The initial VitePress site covers the owner harness team routes that already
exist under `app/api/team`.

## What is documented

- Control routes for starting runs, approving work, archiving threads, and
  sending feedback
- Read routes for status, logs, thread summaries, and thread detail
- Route-to-doc mapping conventions so markdown pages stay aligned with code

## Entry points

- [API reference index](/api/)
- [POST /api/team/run](/api/team/run)
- [GET /api/team/status](/api/team/status)
- [GET /api/team/threads](/api/team/threads/)
- [POST /api/team/threads/:threadId/archive](/api/team/threads/threadId/archive)

## Mapping convention

- Static segments keep the same folder and file names under `docs/api`.
- Route directories that end in `route.ts` map to `index.md`.
- Dynamic route segments drop the square brackets and keep the parameter name.
  Example: `app/api/team/threads/[threadId]/route.ts` maps to
  `docs/api/team/threads/threadId.md`.
