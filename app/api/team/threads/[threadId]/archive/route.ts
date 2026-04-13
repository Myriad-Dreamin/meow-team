// API docs: docs/api/team/threads/threadId/archive.md
import { NextResponse } from "next/server";
import { TeamThreadArchiveError, archiveTeamThread } from "@/lib/team/history";
import { getTeamServerState } from "@/lib/team/server-state";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { threadId } = await context.params;
    const serverState = await getTeamServerState();
    const thread = await archiveTeamThread({
      threadFile: serverState.threadStorage,
      threadId,
    });

    return NextResponse.json({
      ok: true,
      thread,
    });
  } catch (error) {
    if (error instanceof TeamThreadArchiveError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to archive the thread.",
      },
      { status: 500 },
    );
  }
}
