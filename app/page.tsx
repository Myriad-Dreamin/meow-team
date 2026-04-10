import { TeamWorkspace } from "@/components/team-workspace";
import { teamConfig } from "@/team.config";
import { listTeamThreadSummaries } from "@/lib/team/history";
import { listConfiguredRepositories } from "@/lib/team/repositories";
import { teamRuntimeConfig } from "@/lib/team/runtime-config";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [availableRepositories, threadSummaries] = await Promise.all([
    listConfiguredRepositories(teamConfig),
    listTeamThreadSummaries(teamConfig.storage.threadFile),
  ]);

  const hasApiKey = teamRuntimeConfig.hasApiKey;

  return (
    <main className="page-shell">
      <TeamWorkspace
        disabled={!hasApiKey}
        initialPrompt="Create multiple implementation proposals for a new onboarding flow, wait for human approval, and then queue coding plus machine review for the approved proposals."
        initialLogThreadId={threadSummaries[0]?.threadId ?? null}
        initialThreads={threadSummaries}
        repositories={availableRepositories}
        workerCount={teamConfig.dispatch.workerCount}
      />
    </main>
  );
}
