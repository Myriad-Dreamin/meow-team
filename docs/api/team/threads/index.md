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
      "archivedAt": null,
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
  ],
  "archivedThreads": [
    {
      "threadId": "archived-thread-id",
      "assignmentNumber": 1,
      "status": "completed",
      "archivedAt": "2026-04-12T01:30:00.000Z",
      "requestTitle": "Retire the legacy docs sync",
      "updatedAt": "2026-04-12T01:30:00.000Z"
    }
  ],
  "repositoryPicker": {
    "suggestedRepositories": [],
    "remainingRepositories": [],
    "orderedRepositories": []
  },
  "notifications": {
    "generatedAt": "2026-04-14T00:00:00.000Z",
    "target": "browser",
    "notifications": []
  }
}
```

The full objects are serialized `TeamThreadSummary` records from
`lib/team/history.ts`.

- `threads` contains the living thread window only. The default 24-thread limit
  is applied after archived threads are removed from this list.
- `archivedThreads` contains archived thread summaries separately so archived
  history does not skew living-thread counts or list limits.
- `repositoryPicker` contains the current suggested and remaining repository
  ordering for the run form.
- `notifications` embeds the current attention-notification snapshot used by
  the browser workspace settings panel plus the Android and VS Code alert
  clients.

## Failure modes

| Status | When                                  |
| ------ | ------------------------------------- |
| `500`  | Thread summaries could not be loaded. |
