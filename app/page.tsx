import { TeamWorkspace } from "@/components/team-workspace";
import {
  getTeamRepositoryPickerModel,
  getTeamWorkspaceThreadSummaryLists,
} from "@/lib/team/history";
import { buildTeamNotificationsResponse } from "@/lib/team/notifications";
import { listConfiguredRepositories } from "@/lib/team/repositories";
import { getTeamServerState } from "@/lib/team/server-state";
import { teamConfig } from "@/team.config";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const serverState = await getTeamServerState();
  const [availableRepositories, threadSummaryLists] = await Promise.all([
    listConfiguredRepositories(teamConfig),
    getTeamWorkspaceThreadSummaryLists(serverState.threadStorage),
  ]);
  const repositoryPicker = await getTeamRepositoryPickerModel({
    threadFile: serverState.threadStorage,
    repositories: availableRepositories,
  });
  const initialNotifications = buildTeamNotificationsResponse({
    threads: threadSummaryLists.threads,
    target: teamConfig.notifications.target,
  });

  return (
    <main className="page-shell">
      <TeamWorkspace
        disabled={false}
        initialPrompt={
          "Create multiple implementation proposals for a new onboarding flow, wait for human approval, and then queue coding plus machine review for the approved proposals."
        }
        initialArchivedThreads={threadSummaryLists.archivedThreads}
        initialLogThreadId={threadSummaryLists.threads[0]?.threadId ?? null}
        initialNotifications={initialNotifications}
        initialRepositoryPicker={repositoryPicker}
        initialThreads={threadSummaryLists.threads}
        workerCount={teamConfig.dispatch.workerCount}
      />
    </main>
  );
}
