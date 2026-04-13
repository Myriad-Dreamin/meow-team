// API docs: docs/api/team/threads/index.md
import { NextResponse } from "next/server";
import {
  getTeamRepositoryPickerModel,
  getTeamWorkspaceThreadSummaryLists,
} from "@/lib/team/history";
import {
  createInitialTeamRunState,
  createTeamRunEnv,
  persistTeamRunState,
  runTeam,
} from "@/lib/team/coding";
import { listConfiguredRepositories } from "@/lib/team/repositories";
import { getTeamServerState } from "@/lib/team/server-state";
import { teamConfig } from "@/team.config";

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
    const [threadSummaryLists, repositories] = await Promise.all([
      getTeamWorkspaceThreadSummaryLists(serverState.threadStorage),
      listConfiguredRepositories(teamConfig),
    ]);
    const repositoryPicker = await getTeamRepositoryPickerModel({
      threadFile: serverState.threadStorage,
      repositories,
    });

    return NextResponse.json({
      threads: threadSummaryLists.threads,
      archivedThreads: threadSummaryLists.archivedThreads,
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
