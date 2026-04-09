import { NextResponse } from "next/server";
import { z } from "zod";
import { teamConfig } from "@/team.config";
import { markTeamThreadFailed, threadHasActiveDispatchAssignment } from "@/lib/team/history";
import { findConfiguredRepository } from "@/lib/team/repositories";
import { missingOpenAiConfigMessage, teamRuntimeConfig } from "@/lib/team/runtime-config";
import { runTeam, type TeamRunSummary } from "@/lib/team/network";
import type { TeamCodexLogEntry } from "@/lib/team/types";

export const runtime = "nodejs";

type TeamRunStreamEvent =
  | {
      type: "accepted";
      threadId: string;
      startedAt: string;
      status: "running";
    }
  | {
      type: "codex_event";
      entry: TeamCodexLogEntry;
    }
  | {
      type: "result";
      result: TeamRunSummary;
    }
  | {
      type: "error";
      threadId: string;
      error: string;
    };

const runTeamSchema = z.object({
  input: z.string().trim().min(1, "A prompt is required."),
  threadId: z.string().trim().min(1).optional(),
  repositoryId: z.string().trim().min(1).optional(),
  reset: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = runTeamSchema.parse(await request.json());

    if (!teamRuntimeConfig.apiKey) {
      return NextResponse.json(
        {
          error: missingOpenAiConfigMessage,
        },
        { status: 500 },
      );
    }

    if (body.threadId) {
      const hasActiveDispatch = await threadHasActiveDispatchAssignment(
        teamConfig.storage.threadFile,
        body.threadId,
      );

      if (hasActiveDispatch) {
        return NextResponse.json(
          {
            error:
              "This thread still has an active request group. Wait for the coding-review queue to finish, approve the pending proposals, or use the feedback flow before starting a new assignment on the same thread.",
          },
          { status: 409 },
        );
      }
    }

    const selectedRepository = await findConfiguredRepository(teamConfig, body.repositoryId);
    if (body.repositoryId && !selectedRepository) {
      return NextResponse.json(
        {
          error:
            "Selected repository is not available. Only repositories discovered from directories listed in team.config.ts can be used.",
        },
        { status: 400 },
      );
    }

    const threadId = body.threadId ?? crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        let closed = false;

        const close = () => {
          if (closed) {
            return;
          }

          closed = true;
          controller.close();
        };

        const writeEvent = (event: TeamRunStreamEvent) => {
          if (closed) {
            return;
          }

          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        request.signal.addEventListener("abort", () => {
          closed = true;
        });

        void (async () => {
          writeEvent({
            type: "accepted",
            threadId,
            startedAt,
            status: "running",
          });

          try {
            const result = await runTeam({
              ...body,
              threadId,
              onPlannerLogEntry: async (entry) => {
                writeEvent({
                  type: "codex_event",
                  entry,
                });
              },
            });

            writeEvent({
              type: "result",
              result,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error.";
            console.error(`[team-run:${threadId}] ${message}`);

            try {
              await markTeamThreadFailed({
                threadFile: teamConfig.storage.threadFile,
                threadId,
                error: message,
              });
            } catch {
              // The thread may not have been created yet.
            }

            writeEvent({
              type: "error",
              threadId,
              error: message,
            });
          } finally {
            close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/x-ndjson; charset=utf-8",
      },
      status: 200,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
