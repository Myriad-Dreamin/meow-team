import { NextResponse } from "next/server";
import { teamConfig } from "@/team.config";
import { ensurePendingDispatchWork } from "@/lib/team/dispatch";
import { getTeamThreadDetail } from "@/lib/team/history";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { threadId } = await context.params;

    await ensurePendingDispatchWork({ threadId });
    const thread = await getTeamThreadDetail(teamConfig.storage.threadFile, threadId);

    if (!thread) {
      return NextResponse.json(
        {
          error: `Thread ${threadId} was not found.`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      thread,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load the thread.",
      },
      { status: 500 },
    );
  }
}
