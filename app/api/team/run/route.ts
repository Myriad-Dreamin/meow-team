import { NextResponse } from "next/server";
import { z } from "zod";
import { teamConfig } from "@/team.config";
import { markTeamThreadFailed } from "@/lib/team/history";
import { findConfiguredRepository } from "@/lib/team/repositories";
import { missingOpenAiConfigMessage, teamRuntimeConfig } from "@/lib/team/runtime-config";
import { runTeam } from "@/lib/team/network";

export const runtime = "nodejs";

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

    void runTeam({
      ...body,
      threadId,
    }).catch(async (error) => {
      const message = error instanceof Error ? error.message : "Unknown error.";
      console.error(`[team-run:${threadId}] ${message}`);
      await markTeamThreadFailed({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        error: message,
      });
    });

    return NextResponse.json(
      {
        accepted: true,
        status: "running",
        threadId,
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

    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
