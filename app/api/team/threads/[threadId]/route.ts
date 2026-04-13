// API docs: docs/api/team/threads/threadId.md
import { NextResponse } from "next/server";
import { getTeamThreadDetail, getTeamThreadRecord } from "@/lib/team/history";
import {
  createInitialTeamRunState,
  createTeamRunEnv,
  persistTeamRunState,
  runTeam,
} from "@/lib/team/network";
import { getTeamServerState } from "@/lib/team/server-state";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { threadId } = await context.params;
    const serverState = await getTeamServerState();
    const existingThread = await getTeamThreadRecord(serverState.threadStorage, threadId);

    if (!existingThread) {
      return NextResponse.json(
        {
          error: `Thread ${threadId} was not found.`,
        },
        { status: 404 },
      );
    }

    if (!existingThread.archivedAt) {
      const env = createTeamRunEnv();
      const initialState = createInitialTeamRunState({
        kind: "dispatch",
        threadId,
      });
      await persistTeamRunState(env, initialState);
      await runTeam(env, initialState);
    }

    const thread = await getTeamThreadDetail(serverState.threadStorage, threadId);
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
