---
title: API Reference
outline: deep
---

# API reference

This reference mirrors the current `app/api/team` routes. Each route file now
contains a short header comment that points to the matching markdown page.

## Route map

| Route file                                 | Endpoint                          | Docs page                                                       |
| ------------------------------------------ | --------------------------------- | --------------------------------------------------------------- |
| `app/api/team/approval/route.ts`           | `POST /api/team/approval`         | [docs/api/team/approval.md](/api/team/approval)                 |
| `app/api/team/feedback/route.ts`           | `POST /api/team/feedback`         | [docs/api/team/feedback.md](/api/team/feedback)                 |
| `app/api/team/logs/route.ts`               | `GET /api/team/logs`              | [docs/api/team/logs.md](/api/team/logs)                         |
| `app/api/team/run/route.ts`                | `POST /api/team/run`              | [docs/api/team/run.md](/api/team/run)                           |
| `app/api/team/status/route.ts`             | `GET /api/team/status`            | [docs/api/team/status.md](/api/team/status)                     |
| `app/api/team/threads/route.ts`            | `GET /api/team/threads`           | [docs/api/team/threads/index.md](/api/team/threads/)            |
| `app/api/team/threads/[threadId]/route.ts` | `GET /api/team/threads/:threadId` | [docs/api/team/threads/threadId.md](/api/team/threads/threadId) |

## Conventions

- Keep the markdown path aligned with the route folder path whenever the segment
  is static.
- Use `index.md` for folder routes such as `app/api/team/threads/route.ts`.
- Use the parameter name for dynamic segments, such as `threadId.md`.
