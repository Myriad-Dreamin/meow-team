import { TeamWorkspace } from "@/components/team-workspace";
import { teamConfig } from "@/team.config";
import { listTeamThreadSummaries } from "@/lib/team/history";
import { listConfiguredRepositories } from "@/lib/team/repositories";
import { teamRuntimeConfig } from "@/lib/team/runtime-config";
import { prompt as renderInitialPrompt } from "./home-page-initial-prompt.prompt.md";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [availableRepositories, threadSummaries] = await Promise.all([
    listConfiguredRepositories(teamConfig),
    listTeamThreadSummaries(teamConfig.storage.threadFile),
  ]);

  const hasApiKey = teamRuntimeConfig.hasApiKey;
  const initialPrompt = renderInitialPrompt({
    requestTopic: "a new onboarding flow",
  });

  return (
    <main className="page-shell">
      <TeamWorkspace
        disabled={!hasApiKey}
        initialPrompt={initialPrompt}
        initialLogThreadId={threadSummaries[0]?.threadId ?? null}
        initialThreads={threadSummaries}
        repositories={availableRepositories}
        workerCount={teamConfig.dispatch.workerCount}
      />
    </main>
  );
}
