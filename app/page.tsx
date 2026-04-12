import { TeamWorkspace } from "@/components/team-workspace";
import { getTeamRepositoryPickerModel, listTeamThreadSummaries } from "@/lib/team/history";
import { listConfiguredRepositories } from "@/lib/team/repositories";
import { getTeamServerState } from "@/lib/team/server-state";
import { teamConfig } from "@/team.config";
import { teamRuntimeConfig } from "@/lib/config/runtime";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const serverState = await getTeamServerState();
  const [availableRepositories, threadSummaries] = await Promise.all([
    listConfiguredRepositories(teamConfig),
    listTeamThreadSummaries(serverState.threadStorage),
  ]);
  const repositoryPicker = await getTeamRepositoryPickerModel({
    threadFile: serverState.threadStorage,
    repositories: availableRepositories,
  });

  const hasApiKey = teamRuntimeConfig.hasApiKey;

  return (
    <main className="page-shell">
      <TeamWorkspace
        disabled={!hasApiKey}
        initialPrompt={
          "Create multiple implementation proposals for a new onboarding flow, wait for human approval, and then queue coding plus machine review for the approved proposals."
        }
        initialLogThreadId={threadSummaries[0]?.threadId ?? null}
        initialRepositoryPicker={repositoryPicker}
        initialThreads={threadSummaries}
        workerCount={teamConfig.dispatch.workerCount}
      />
    </main>
  );
}
