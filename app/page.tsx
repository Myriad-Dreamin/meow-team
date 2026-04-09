import { TeamConsole } from "@/components/team-console";
import { ThreadStatusBoard } from "@/components/thread-status-board";
import { teamConfig } from "@/team.config";
import { listTeamThreadSummaries } from "@/lib/team/history";
import { listAvailableRolePrompts, loadWorkflowRolePrompts } from "@/lib/team/prompts";
import { listConfiguredRepositories, resolveConfiguredRepositoryRoots } from "@/lib/team/repositories";
import { codexUserConfigDisplayPaths, teamRuntimeConfig } from "@/lib/team/runtime-config";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const configuredRepositoryRoots = resolveConfiguredRepositoryRoots(teamConfig);
  const [workflowRoles, availableRoles, availableRepositories, threadSummaries] = await Promise.all([
    loadWorkflowRolePrompts(teamConfig),
    listAvailableRolePrompts(),
    listConfiguredRepositories(teamConfig),
    listTeamThreadSummaries(teamConfig.storage.threadFile),
  ]);

  const hasApiKey = teamRuntimeConfig.hasApiKey;

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">AgentKit Harness</p>
          <h1>One config, one owner, one continuous engineering team.</h1>
          <p className="lead">
            This project resets the copied launcher into a clean AgentKit setup that uses Codex
            as the backend model, deterministic routing, and Markdown role prompts for harness
            engineering.
          </p>
        </div>

        <div className="hero-metrics">
          <article>
            <span className="metric-label">Owner</span>
            <strong>{teamConfig.owner.name}</strong>
            <p>{teamConfig.owner.objective}</p>
          </article>
          <article>
            <span className="metric-label">Workflow</span>
            <strong>{`planner -> ${teamConfig.dispatch.workerCount}x(coder + reviewer)`}</strong>
            <p>Planner creates proposal lanes first, then approved proposals flow into background coding and machine review.</p>
          </article>
          <article>
            <span className="metric-label">Codex Backend</span>
            <strong>{teamConfig.model.model}</strong>
            <p>OpenAI-compatible chat adapter through the Inngest AI adapter.</p>
          </article>
          <article>
            <span className="metric-label">Repositories</span>
            <strong>
              {configuredRepositoryRoots.length > 0
                ? `${availableRepositories.length} available`
                : "Not configured"}
            </strong>
            <p>
              Only repositories found inside directories listed in `team.config.ts` appear in the
              selector.
            </p>
          </article>
          <article>
            <span className="metric-label">Parallel Lanes</span>
            <strong>{teamConfig.dispatch.workerCount}</strong>
            <p>Idle until a human approves a proposal, then tracked live through coding, review, and replanning feedback.</p>
          </article>
        </div>
      </section>

      {!hasApiKey ? (
        <section className="warning-panel">
          <p className="eyebrow">Configuration Needed</p>
          <h2>Connect your Codex user config to run the team.</h2>
          <p>
            The server reads model settings from <code>{codexUserConfigDisplayPaths.config}</code>{" "}
            and credentials from <code>{codexUserConfigDisplayPaths.auth}</code>. The homepage can
            still show the configuration, but actual AgentKit runs stay disabled until that auth is
            available.
          </p>
        </section>
      ) : null}

      <section className="content-grid">
        <section className="info-panel">
          <div className="section-header">
            <p className="eyebrow">Single Config</p>
            <h2>Owned Team Settings</h2>
            <p className="section-copy">
              Everything that defines the active team lives in one file: owner, workflow, storage,
              model settings, proposal lanes, reusable worktree roots, and allowed local repository directories.
            </p>
          </div>

          <pre className="code-block">{`// team.config.ts
defineTeamConfig({
  name: "${teamConfig.name}",
  owner: { name: "${teamConfig.owner.name}" },
  workflow: ${JSON.stringify(teamConfig.workflow)},
  model: { model: "${teamConfig.model.model}" },
  dispatch: { workerCount: ${teamConfig.dispatch.workerCount} },
  repositories: { roots: ${configuredRepositoryRoots.length} },
  maxIterations: ${teamConfig.maxIterations},
});`}</pre>
        </section>

        <section className="info-panel">
          <div className="section-header">
            <p className="eyebrow">Roles</p>
            <h2>Workflow Prompts</h2>
            <p className="section-copy">
              Each role comes from a Markdown prompt file. To add a new role, create a new prompt
              and add its role ID to the workflow in `team.config.ts`. The planner remains the
              proposal coordinator while coder and reviewer prompts are reused inside each approved proposal lane.
            </p>
          </div>

          <div className="role-grid">
            {workflowRoles.map((role) => (
              <article className="role-card" key={role.id}>
                <div className="role-head">
                  <p className="eyebrow">{role.id}</p>
                  <span>{role.filePath.replace(`${process.cwd()}/`, "")}</span>
                </div>
                <h3>{role.name}</h3>
                <p>{role.summary}</p>
              </article>
            ))}
          </div>
        </section>
      </section>

      <TeamConsole
        disabled={!hasApiKey}
        initialPrompt="Create multiple implementation proposals for a new onboarding flow, wait for human approval, and then queue coding plus machine review for the approved proposals."
        repositories={availableRepositories}
        workerCount={teamConfig.dispatch.workerCount}
      />

      <ThreadStatusBoard initialThreads={threadSummaries} />

      <section className="footer-grid">
        <section className="info-panel">
          <div className="section-header compact">
            <p className="eyebrow">Role Library</p>
            <h2>Available Markdown Roles</h2>
          </div>
          <div className="available-roles">
            {availableRoles.map((role) => (
              <span className="library-pill" key={role.id}>
                {role.id}
              </span>
            ))}
          </div>
        </section>

        <section className="info-panel">
          <div className="section-header compact">
            <p className="eyebrow">Repositories</p>
            <h2>Scoped Local Access</h2>
          </div>
          <p className="section-copy">
            The repository selector only lists repositories discovered inside these configured
            directories.
          </p>
          {configuredRepositoryRoots.length > 0 ? (
            <div className="repository-root-list">
              {configuredRepositoryRoots.map((root) => (
                <article className="repository-root-card" key={root.id}>
                  <p className="timeline-title">{root.label}</p>
                  <p className="repository-root-path">
                    <code>{root.directory}</code>
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="section-copy">
              Add `repositories.roots` in `team.config.ts` to enable local repository selection.
            </p>
          )}
        </section>

        <section className="info-panel">
          <div className="section-header compact">
            <p className="eyebrow">Continuous Runs</p>
            <h2>How persistence works</h2>
          </div>
          <p className="section-copy">
            The planner stores its AgentKit thread history in local JSON, while background worker
            lanes persist proposal, branch, worktree, queue, pull request, and feedback state
            alongside the thread. Reusing a thread ID keeps the same planning conversation alive
            after the current request-group cycle finishes.
          </p>
        </section>
      </section>
    </main>
  );
}
