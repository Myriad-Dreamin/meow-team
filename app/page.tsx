import { TeamConsole } from "@/components/team-console";
import { teamConfig } from "@/team.config";
import { listAvailableRolePrompts, loadWorkflowRolePrompts } from "@/lib/team/prompts";

export default async function HomePage() {
  const [workflowRoles, availableRoles] = await Promise.all([
    loadWorkflowRolePrompts(teamConfig),
    listAvailableRolePrompts(),
  ]);

  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);

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
            <strong>{teamConfig.workflow.join(" -> ")}</strong>
            <p>Planner, coder, reviewer by default, extensible through Markdown files.</p>
          </article>
          <article>
            <span className="metric-label">Codex Backend</span>
            <strong>{teamConfig.model.model}</strong>
            <p>OpenAI Responses API through the Inngest AI adapter.</p>
          </article>
        </div>
      </section>

      {!hasApiKey ? (
        <section className="warning-panel">
          <p className="eyebrow">Configuration Needed</p>
          <h2>Add `OPENAI_API_KEY` to `.env.local` to run the team.</h2>
          <p>
            The homepage can still show the configuration, but actual AgentKit runs are disabled
            until the OpenAI key is available.
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
              and model settings.
            </p>
          </div>

          <pre className="code-block">{`// team.config.ts
defineTeamConfig({
  name: "${teamConfig.name}",
  owner: { name: "${teamConfig.owner.name}" },
  workflow: ${JSON.stringify(teamConfig.workflow)},
  model: { model: "${teamConfig.model.model}" },
  maxIterations: ${teamConfig.maxIterations},
});`}</pre>
        </section>

        <section className="info-panel">
          <div className="section-header">
            <p className="eyebrow">Roles</p>
            <h2>Workflow Prompts</h2>
            <p className="section-copy">
              Each role comes from a Markdown prompt file. To add a new role, create a new prompt
              and add its role ID to the workflow in `team.config.ts`.
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
        initialPrompt="Design a new role prompt for a researcher, add it to the workflow, and make the reviewer call out any missing validation."
      />

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
            <p className="eyebrow">Continuous Runs</p>
            <h2>How persistence works</h2>
          </div>
          <p className="section-copy">
            The team stores AgentKit thread history in local JSON. Reusing a thread ID keeps the
            same team conversation alive, while a new input or an explicit reset starts a fresh
            planner-to-reviewer assignment cycle.
          </p>
        </section>
      </section>
    </main>
  );
}
