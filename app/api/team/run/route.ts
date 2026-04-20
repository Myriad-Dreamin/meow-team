// API docs: docs/api/team/run.md
import { NextResponse } from "next/server";
import { z } from "zod";
import { teamConfig } from "@/team.config";
import { ExistingBranchesRequireDeleteError } from "@/lib/team/git";
import {
  countActiveDispatchThreads,
  markTeamThreadFailed,
  threadHasActiveDispatchAssignment,
} from "@/lib/team/history";
import { findConfiguredRepository } from "@/lib/team/repositories";
import { getTeamRuntimeConfig, missingOpenAiConfigMessage } from "@/lib/config/runtime";
import {
  createInitialTeamRunState,
  createTeamRunEnv,
  DispatchThreadCapacityError,
  persistTeamRunState,
  runTeam,
  type TeamRunSummary,
} from "@/lib/team/coding";
import { getTeamServerState } from "@/lib/team/server-state";
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
    }
  | {
      type: "branch_delete_required";
      threadId: string;
      error: string;
      branches: string[];
    };

const runTeamSchema = z.object({
  input: z.string().trim().min(1, "A prompt is required."),
  title: z.string().trim().min(1).optional(),
  threadId: z.string().trim().min(1).optional(),
  repositoryId: z.string().trim().min(1).optional(),
  reset: z.boolean().optional(),
  deleteExistingBranches: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = runTeamSchema.parse(await request.json());
    const serverState = await getTeamServerState();

    if (!getTeamRuntimeConfig().apiKey) {
      return NextResponse.json(
        {
          error: missingOpenAiConfigMessage,
        },
        { status: 500 },
      );
    }

    if (body.threadId) {
      const hasActiveDispatch = await threadHasActiveDispatchAssignment(
        serverState.threadStorage,
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

    if (selectedRepository) {
      const activeDispatchThreadCount = await countActiveDispatchThreads(
        serverState.threadStorage,
        {
          excludeThreadId: body.threadId,
        },
      );
      if (activeDispatchThreadCount >= teamConfig.dispatch.workerCount) {
        const capacityError = new DispatchThreadCapacityError(teamConfig.dispatch.workerCount);
        return NextResponse.json(
          {
            error: capacityError.message,
          },
          { status: 409 },
        );
      }
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
          try {
            const initialState = createInitialTeamRunState({
              kind: "planning",
              ...body,
              threadId,
            });
            const env = createTeamRunEnv({
              onPlannerLogEntry: async (entry) => {
                writeEvent({
                  type: "codex_event",
                  entry,
                });
              },
            });
            await persistTeamRunState(env, initialState);

            writeEvent({
              type: "accepted",
              threadId,
              startedAt,
              status: "running",
            });

            const result = await runTeam(env, initialState);
            if (!result) {
              throw new Error("Planning completed without a team run summary.");
            }

            writeEvent({
              type: "result",
              result: result as TeamRunSummary,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error.";
            console.error(`[team-run:${threadId}] ${message}`);

            if (error instanceof ExistingBranchesRequireDeleteError) {
              writeEvent({
                type: "branch_delete_required",
                threadId,
                error: message,
                branches: error.branchNames,
              });
            } else {
              try {
                await markTeamThreadFailed({
                  threadFile: serverState.threadStorage,
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
            }
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
