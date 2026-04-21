// API docs: docs/api/team/notifications.md
import { NextResponse } from "next/server";
import { getTeamConfig } from "@/lib/config/team-loader";
import { getTeamWorkspaceThreadSummaryLists } from "@/lib/team/history";
import { buildTeamNotificationsResponse } from "@/lib/team/notifications";
import {
  createInitialTeamRunState,
  createTeamRunEnv,
  persistTeamRunState,
  runTeam,
} from "@/lib/team/coding";
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
    const teamConfig = getTeamConfig();
    const threadSummaryLists = await getTeamWorkspaceThreadSummaryLists(serverState.threadStorage);

    return NextResponse.json(
      buildTeamNotificationsResponse({
        threads: threadSummaryLists.threads,
        target: teamConfig.notifications.target,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load attention notifications.",
      },
      { status: 500 },
    );
  }
}
