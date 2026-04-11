---
title: GET /api/team/logs
outline: deep
---

# GET /api/team/logs

Returns recent Codex log entries for a thread.

## Route file

`app/api/team/logs/route.ts`

## Query parameters

| Name       | Type   | Required | Notes                                                           |
| ---------- | ------ | -------- | --------------------------------------------------------------- |
| `threadId` | string | Yes      | Thread whose `codex-logs/<threadId>.jsonl` file should be read. |
| `limit`    | number | No       | Positive integer, defaults to `200`, capped at `500`.           |

## Success response

```json
{
  "entries": [
    {
      "id": "entry-id",
      "threadId": "thread-id",
      "assignmentNumber": 1,
      "roleId": "planner",
      "laneId": "lane-1",
      "source": "stdout",
      "message": "Planner output",
      "createdAt": "2026-04-12T00:00:00.000Z"
    }
  ]
}
```

## Failure modes

| Status | When                                  |
| ------ | ------------------------------------- |
| `400`  | Query parameters fail Zod validation. |
| `500`  | The log file could not be read.       |
