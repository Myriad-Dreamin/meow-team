import { NextResponse } from "next/server";
import { z } from "zod";
import { teamConfig } from "@/team.config";
import { prepareAssignmentReplan } from "@/lib/team/dispatch";
import { markTeamThreadFailed } from "@/lib/team/history";
import { runTeam } from "@/lib/team/network";
import { missingOpenAiConfigMessage, teamRuntimeConfig } from "@/lib/team/runtime-config";

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

    void runTeam({
      input: nextRun.input,
      threadId: body.threadId,
      repositoryId: nextRun.repositoryId,
      reset: true,
    }).catch(async (error) => {
      const message = error instanceof Error ? error.message : "Unknown error.";
      console.error(`[team-feedback:${body.threadId}] ${message}`);
      await markTeamThreadFailed({
        threadFile: teamConfig.storage.threadFile,
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
