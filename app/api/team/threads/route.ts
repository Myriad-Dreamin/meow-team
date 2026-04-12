// API docs: docs/api/team/threads/index.md
import { NextResponse } from "next/server";
import { listTeamThreadSummaries } from "@/lib/team/history";
import {
  createInitialTeamRunState,
  createTeamRunEnv,
  persistTeamRunState,
  runTeam,
} from "@/lib/team/network";
import { getTeamServerState } from "@/lib/team/server-state";

export const runtime = "nodejs";

export async function GET() {
  try {
    const env = createTeamRunEnv();
    const initialState = createInitialTeamRunState({
      kind: "dispatch",
    });
    await persistTeamRunState(env, initialState);
    await runTeam(env, initialState);
    const serverState = await getTeamServerState();
    const threads = await listTeamThreadSummaries(serverState.threadStorage);
    return NextResponse.json({
      threads,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load living threads.",
      },
      { status: 500 },
    );
  }
}
