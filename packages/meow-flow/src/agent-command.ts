import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { resolvePaseoCommandInvocation } from "./paseo-command.js";
import { resolveCurrentThread } from "./thread-command.js";
import {
  isSupportedSkill,
  type MeowFlowSkill,
  upsertAgentRecord,
  updateMeowFlowState,
} from "./thread-state.js";

type PaseoInvocationResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

export function createAgentCommand(): Command {
  return new Command("agent")
    .description("Update MeowFlow metadata for the current Paseo agent")
    .addCommand(createAgentUpdateSelfCommand());
}

function createAgentUpdateSelfCommand(): Command {
  return new Command("update-self")
    .description("Detect and persist metadata for the current Paseo agent")
    .action((_options: unknown, command: Command) => {
      try {
        const currentAgentId = process.env.PASEO_AGENT_ID?.trim();
        if (!currentAgentId) {
          throw new Error("PASEO_AGENT_ID is not set; cannot detect the current Paseo agent.");
        }

        const current = resolveCurrentThread("mfl agent update-self");
        const inferred = inferCurrentAgentSkill(currentAgentId);
        if (!inferred.skill) {
          throw new Error(
            "Current agent skill could not be detected. Expected one of meow-plan, meow-code, meow-review, meow-execute, meow-validate, or meow-archive.",
          );
        }

        invokePaseoAgentUpdate({
          agentId: currentAgentId,
          threadId: current.threadId,
          skill: inferred.skill,
        });

        const now = new Date().toISOString();
        updateMeowFlowState(current.context.repositoryRoot, (state) => {
          upsertAgentRecord(state, {
            threadId: current.threadId,
            agentId: currentAgentId,
            title: inferred.title,
            skill: inferred.skill,
            now,
          });
        });

        process.stdout.write(
          [
            `agent-id: ${currentAgentId}`,
            `thread-id: ${current.threadId}`,
            `skill: ${inferred.skill}`,
            "",
          ].join("\n"),
        );
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      }
    });
}

function inferCurrentAgentSkill(agentId: string): {
  readonly skill: MeowFlowSkill | null;
  readonly title: string | null;
} {
  const envSkill = [
    process.env.MFL_AGENT_SKILL,
    process.env.MEOW_FLOW_AGENT_SKILL,
    process.env.PASEO_MEOW_SKILL,
    process.env.PASEO_AGENT_SKILL,
  ]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));

  if (envSkill && isSupportedSkill(envSkill)) {
    return {
      skill: envSkill,
      title: process.env.MFL_AGENT_TITLE?.trim() || null,
    };
  }

  const inspect = invokePaseo(["agent", "inspect", agentId, "--json"]);
  const inspectText = `${inspect.stdout}\n${inspect.stderr}`;
  const inspectSkill = findSupportedSkill(inspectText);
  const inspectTitle = parseInspectTitle(inspect.stdout);
  if (inspectSkill) {
    return {
      skill: inspectSkill,
      title: inspectTitle,
    };
  }

  const logs = invokePaseo(["logs", agentId, "--tail", "200"]);
  const logSkill = findSupportedSkill(`${logs.stdout}\n${logs.stderr}`);

  return {
    skill: logSkill,
    title: inspectTitle,
  };
}

function invokePaseoAgentUpdate(input: {
  readonly agentId: string;
  readonly threadId: string;
  readonly skill: MeowFlowSkill;
}): void {
  const result = invokePaseo([
    "agent",
    "update",
    input.agentId,
    "--label",
    `x-meow-flow-id=${input.threadId}`,
    "--label",
    `x-meow-flow-skill=${input.skill}`,
    "--json",
  ]);

  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(
      detail.length === 0
        ? `paseo agent update failed with exit code ${result.status}.`
        : `paseo agent update failed with exit code ${result.status}: ${detail}`,
    );
  }
}

function invokePaseo(args: readonly string[]): PaseoInvocationResult {
  const paseoCommand = resolvePaseoCommandInvocation();
  const result = spawnSync(paseoCommand.command, [...paseoCommand.argsPrefix, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function findSupportedSkill(text: string): MeowFlowSkill | null {
  const match = /\bmeow-(?:plan|code|review|execute|validate|archive)\b/.exec(text);
  const skill = match?.[0];

  return skill && isSupportedSkill(skill) ? skill : null;
}

function parseInspectTitle(stdout: string): string | null {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "Name" in parsed &&
      typeof parsed.Name === "string" &&
      parsed.Name !== "-"
    ) {
      return parsed.Name;
    }
  } catch {
    return null;
  }

  return null;
}
