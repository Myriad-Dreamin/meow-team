// API docs: docs/api/team/threads/index.md
import { NextResponse } from "next/server";
import { getTeamConfig } from "@/lib/config/team-loader";
import {
  getTeamRepositoryPickerModel,
  getTeamWorkspaceThreadSummaryLists,
} from "@/lib/team/history";
import { buildTeamNotificationsResponse } from "@/lib/team/notifications";
import {
  createInitialTeamRunState,
  createTeamRunEnv,
  persistTeamRunState,
  runTeam,
} from "@/lib/team/coding";
import { listConfiguredRepositories } from "@/lib/team/repositories";
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
    const [threadSummaryLists, repositories] = await Promise.all([
      getTeamWorkspaceThreadSummaryLists(serverState.threadStorage),
      listConfiguredRepositories(teamConfig),
    ]);
    const repositoryPicker = await getTeamRepositoryPickerModel({
      threadFile: serverState.threadStorage,
      repositories,
    });
    const notifications = buildTeamNotificationsResponse({
      threads: threadSummaryLists.threads,
      target: teamConfig.notifications.target,
    });

    return NextResponse.json({
      threads: threadSummaryLists.threads,
      archivedThreads: threadSummaryLists.archivedThreads,
      notifications,
      repositoryPicker,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load workspace threads.",
      },
      { status: 500 },
    );
  }
}
