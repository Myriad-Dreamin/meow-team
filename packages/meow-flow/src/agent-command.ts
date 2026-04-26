import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { resolvePaseoCommandInvocation } from "./paseo-command.js";
import { resolveCurrentThread } from "./thread-command.js";
import {
  isSupportedSkill,
  type MeowFlowSkill,
  stageToSkill,
  SUPPORTED_STAGES,
  upsertAgentRecord,
  updateMeowFlowState,
  withMeowFlowStateDatabase,
} from "./thread-state.js";

type PaseoInvocationResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

type AgentListEntry = {
  readonly id: string | null;
  readonly shortId: string | null;
  readonly title: string | null;
};

const SUPPORTED_SKILLS: readonly MeowFlowSkill[] = [
  "meow-plan",
  "meow-code",
  "meow-review",
  "meow-execute",
  "meow-validate",
  "meow-archive",
];

const SKILL_LABEL_KEYS = ["x-meow-flow-skill", "meow-flow.skill"] as const;
const STAGE_LABEL_KEYS = ["x-meow-flow-stage", "meow-flow.stage"] as const;

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

        withMeowFlowStateDatabase((database) => {
          const current = resolveCurrentThread("mfl agent update-self", { database });
          const inferred = inferCurrentAgentSkill(currentAgentId);
          if (!inferred.skill) {
            throw new Error(
              "Current agent skill could not be detected. Expected one of meow-plan, meow-code, meow-review, meow-execute, meow-validate, or meow-archive.",
            );
          }
          const skill = inferred.skill;

          invokePaseoAgentUpdate({
            agentId: currentAgentId,
            threadId: current.threadId,
            skill,
          });

          const now = new Date().toISOString();
          updateMeowFlowState(
            current.context.repositoryRoot,
            (state) => {
              upsertAgentRecord(state, {
                threadId: current.threadId,
                agentId: currentAgentId,
                title: inferred.title,
                skill,
                now,
              });
            },
            {
              database,
              threadIds: [current.threadId],
              includeOccupationThreads: false,
            },
          );

          process.stdout.write(
            [
              `agent-id: ${currentAgentId}`,
              `thread-id: ${current.threadId}`,
              `skill: ${skill}`,
              "",
            ].join("\n"),
          );
        });
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

  const labelSkill = inferAgentSkillFromLabels(agentId);
  if (labelSkill) {
    return labelSkill;
  }

  return {
    skill: null,
    title: null,
  };
}

function inferAgentSkillFromLabels(agentId: string): {
  readonly skill: MeowFlowSkill;
  readonly title: string | null;
} | null {
  for (const labelKey of SKILL_LABEL_KEYS) {
    for (const skill of SUPPORTED_SKILLS) {
      const entry = findAgentByLabel(agentId, `${labelKey}=${skill}`);
      if (entry) {
        return {
          skill,
          title: entry.title,
        };
      }
    }
  }

  for (const labelKey of STAGE_LABEL_KEYS) {
    for (const stage of SUPPORTED_STAGES) {
      const entry = findAgentByLabel(agentId, `${labelKey}=${stage}`);
      if (entry) {
        return {
          skill: stageToSkill(stage),
          title: entry.title,
        };
      }
    }
  }

  return null;
}

function findAgentByLabel(agentId: string, label: string): AgentListEntry | null {
  const result = invokePaseo(["agent", "ls", "-a", "--label", label, "--json"]);

  if (result.status !== 0) {
    return null;
  }

  return parseAgentList(result.stdout).find((entry) => matchesAgentId(entry, agentId)) ?? null;
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

function parseAgentList(stdout: string): readonly AgentListEntry[] {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    const entries = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.data)
        ? parsed.data
        : isRecord(parsed)
          ? [parsed]
          : [];

    return entries.map(normalizeAgentListEntry).filter(isNotNull);
  } catch {
    return [];
  }
}

function normalizeAgentListEntry(value: unknown): AgentListEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id) ?? readString(value.Id);
  const shortId = readString(value.shortId) ?? readString(value.ShortId);

  if (!id && !shortId) {
    return null;
  }

  return {
    id,
    shortId,
    title:
      normalizeTitle(readString(value.name)) ??
      normalizeTitle(readString(value.title)) ??
      normalizeTitle(readString(value.Name)),
  };
}

function matchesAgentId(entry: AgentListEntry, agentId: string): boolean {
  return (
    entry.id === agentId ||
    entry.shortId === agentId ||
    (entry.shortId !== null && agentId.startsWith(entry.shortId))
  );
}

function normalizeTitle(value: string | null): string | null {
  const title = value?.trim();
  return title && title !== "-" ? title : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}
