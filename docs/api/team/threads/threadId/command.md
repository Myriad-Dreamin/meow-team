---
title: POST /api/team/threads/:threadId/command
outline: deep
---

# POST /api/team/threads/:threadId/command

Parses and executes a supported slash command against the latest assignment on
one thread.

## Route file

`app/api/team/threads/[threadId]/command/route.ts`

## Path parameters

| Name       | Type   | Required | Notes                                                                    |
| ---------- | ------ | -------- | ------------------------------------------------------------------------ |
| `threadId` | string | Yes      | The stored thread ID whose latest assignment should receive the command. |

## Request body

| Field     | Type   | Required | Notes                                                                                                                                                                         |
| --------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | string | Yes      | Raw slash command text. Supported forms are `/approve [proposal-number]`, `/ready [proposal-number]`, `/replan [proposal-number] requirement`, and `/replan-all requirement`. |

## Success response

Proposal approval and final-approval commands return `200 OK`. Replan commands
return `202 Accepted` because they start a fresh planning run in the
background.

```json
{
  "ok": true,
  "assignmentNumber": 3,
  "commandName": "approve",
  "outcome": "partial",
  "message": "Queued proposal approval for proposals 1 and 3. Skipped proposal 2 because it is not awaiting proposal approval.",
  "details": [
    "Queued proposal approval for proposals 1 and 3.",
    "Skipped proposal 2 because it is not awaiting proposal approval."
  ]
}
```

`outcome` is one of:

- `success`: every targeted proposal executed successfully
- `partial`: the batch mixed successes with skips or stopped after a hard failure
- `skipped`: the command was valid but no targeted proposal was eligible
- `accepted`: replanning was accepted and the planner restart is in progress

## Failure modes

| Status | When                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `400`  | The request body is invalid, the slash-command syntax is unsupported, or the requested proposal number is not on the latest assignment.                                  |
| `404`  | No thread exists for the requested `threadId`.                                                                                                                           |
| `409`  | The thread is archived, has no latest assignment yet, the latest assignment is being replanned or already superseded, or it still has queued, coding, or reviewing work. |
| `500`  | Command execution failed unexpectedly.                                                                                                                                   |

## UI notes

The selected-thread detail view shows a bottom command composer that posts to
this endpoint. The composer is disabled when the thread is archived, the thread
has no latest assignment yet, the latest assignment is being replanned or
already superseded, or the latest assignment still has queued, coding, or
reviewing work. It shows the latest command result inline after each
submission.
