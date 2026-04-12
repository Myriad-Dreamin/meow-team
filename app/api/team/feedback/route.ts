// API docs: docs/api/team/feedback.md
import { NextResponse } from "next/server";
import { z } from "zod";
import { markTeamThreadFailed } from "@/lib/team/history";
import {
  createInitialTeamRunState,
  createTeamRunEnv,
  prepareAssignmentReplan,
  persistTeamRunState,
  runTeam,
} from "@/lib/team/network";
import { missingOpenAiConfigMessage, teamRuntimeConfig } from "@/lib/config/runtime";
import { getTeamServerState } from "@/lib/team/server-state";

export const runtime = "nodejs";

const feedbackSchema = z
  .object({
    threadId: z.string().trim().min(1),
    assignmentNumber: z.number().int().positive(),
    scope: z.enum(["assignment", "proposal"]),
    laneId: z.string().trim().min(1).optional(),
    suggestion: z.string().trim().min(1, "A suggestion is required."),
  })
  .superRefine((value, context) => {
    if (value.scope === "proposal" && !value.laneId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["laneId"],
        message: "A proposal lane ID is required for proposal-scoped feedback.",
      });
    }
  });

export async function POST(request: Request) {
  try {
    const body = feedbackSchema.parse(await request.json());
    const serverState = await getTeamServerState();

    if (!teamRuntimeConfig.apiKey) {
      return NextResponse.json(
        {
          error: missingOpenAiConfigMessage,
        },
        { status: 500 },
      );
    }

    const nextRun = await prepareAssignmentReplan(body);
    const startedAt = new Date().toISOString();
    const initialState = createInitialTeamRunState({
      kind: "planning",
      input: nextRun.input,
      threadId: body.threadId,
      title: nextRun.title,
      requestText: nextRun.requestText,
      repositoryId: nextRun.repositoryId,
      reset: true,
    });
    const env = createTeamRunEnv();
    await persistTeamRunState(env, initialState);

    void runTeam(env, initialState).catch(async (error) => {
      const message = error instanceof Error ? error.message : "Unknown error.";
      console.error(`[team-feedback:${body.threadId}] ${message}`);
      await markTeamThreadFailed({
        threadFile: serverState.threadStorage,
        threadId: body.threadId,
        error: message,
      });
    });

    return NextResponse.json(
      {
        accepted: true,
        status: "planning",
        threadId: body.threadId,
        startedAt,
      },
      { status: 202 },
    );
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

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to submit human feedback.",
      },
      { status: 500 },
    );
  }
}
