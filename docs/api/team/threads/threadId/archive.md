---
title: POST /api/team/threads/:threadId/archive
outline: deep
---

# POST /api/team/threads/:threadId/archive

Archives one inactive thread so it disappears from the living sidebar and moves
into the archived list.

## Route file

`app/api/team/threads/[threadId]/archive/route.ts`

## Path parameters

| Name       | Type   | Required | Notes                            |
| ---------- | ------ | -------- | -------------------------------- |
| `threadId` | string | Yes      | The stored thread ID to archive. |

## Request

This route does not accept a request body.

## Success response

```json
{
  "ok": true,
  "thread": {
    "summary": {
      "threadId": "thread-id",
      "archivedAt": "2026-04-12T01:30:00.000Z"
    }
  }
}
```

The returned `thread` payload is the same `TeamThreadDetail` shape documented
for [`GET /api/team/threads/:threadId`](/api/team/threads/threadId).

## Failure modes

| Status | When                                                     |
| ------ | -------------------------------------------------------- |
| `404`  | No thread exists for the requested `threadId`.           |
| `409`  | The thread is already archived or still has active work. |
| `500`  | The archive mutation could not be completed.             |
