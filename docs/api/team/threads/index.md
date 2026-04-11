---
title: GET /api/team/threads
outline: deep
---

# GET /api/team/threads

Returns thread summaries after first ensuring any pending dispatch work is
refreshed.

## Route file

`app/api/team/threads/route.ts`

## Request

This route does not accept a body or query parameters.

## Success response

```json
{
  "threads": [
    {
      "threadId": "thread-id",
      "assignmentNumber": 1,
      "status": "running",
      "requestTitle": "Set up VitePress API docs",
      "latestDecision": "continue",
      "workerCounts": {
        "idle": 0,
        "queued": 0,
        "coding": 1,
        "reviewing": 0,
        "awaitingHumanApproval": 0,
        "approved": 0,
        "failed": 0
      },
      "updatedAt": "2026-04-12T00:00:00.000Z"
    }
  ]
}
```

The full objects are serialized `TeamThreadSummary` records from
`lib/team/history.ts`.

## Failure modes

| Status | When                                  |
| ------ | ------------------------------------- |
| `500`  | Thread summaries could not be loaded. |
