import "server-only";

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { teamConfig } from "@/team.config";
import { teamRuntimeConfig } from "@/lib/team/runtime-config";
import type { TeamCodexEvent, TeamCodexLogSource } from "@/lib/team/types";

const ERROR_OUTPUT_LINE_LIMIT = 80;
const GLOBAL_CODEX_SKILLS_ROOT = path.join(homedir(), ".codex", "skills");
const REPOSITORY_CODEX_SKILLS_ROOT = path.join(process.cwd(), ".codex", "skills");

export const codexLaneResponseSchema = z.object({
  summary: z.string().trim().min(1),
  deliverable: z.string().trim().min(1),
  decision: z.enum(["continue", "approved", "needs_revision"]),
  pullRequestTitle: z.string().trim().min(1).nullable(),
  pullRequestSummary: z.string().trim().min(1).nullable(),
});

export type CodexLaneResponse = z.infer<typeof codexLaneResponseSchema>;

const quoteTomlString = (value: string): string => {
  return JSON.stringify(value);
};

const trimErrorOutput = (value: string): string => {
  const lines = value
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  return lines.slice(-ERROR_OUTPUT_LINE_LIMIT).join("\n");
};

const parseStructuredMessage = <TSchema extends z.ZodTypeAny>(
  raw: string,
  schema: TSchema,
): z.infer<TSchema> => {
  const trimmed = raw.trim();
  const normalized = trimmed
    .replace(/^```json\s*/u, "")
    .replace(/^```\s*/u, "")
    .replace(/\s*```$/u, "");

  return schema.parse(JSON.parse(normalized));
};

const createCodexEvent = ({
  source,
  message,
}: {
  source: TeamCodexLogSource;
  message: string;
}): TeamCodexEvent => {
  return {
    source,
    message,
    createdAt: new Date().toISOString(),
  };
};

const buildCodexExecArgs = ({
  worktreePath,
  schemaPath,
  outputPath,
  prompt,
}: {
  worktreePath: string;
  schemaPath: string;
  outputPath: string;
  prompt: string;
}): string[] => {
  const args = [
    "exec",
    "--cd",
    worktreePath,
    "--sandbox",
    "workspace-write",
    "--ephemeral",
    "--color",
    "never",
    "--disable",
    "multi_agent",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
    "--model",
    teamConfig.model.model,
  ];

  if (teamRuntimeConfig.modelProvider) {
    args.push("-c", `model_provider=${quoteTomlString(teamRuntimeConfig.modelProvider)}`);
  }

  args.push("-c", `model_reasoning_effort=${quoteTomlString(teamConfig.model.reasoningEffort)}`);
  args.push("-c", "disable_response_storage=true");
  args.push("-c", 'network_access="enabled"');

  if (teamRuntimeConfig.modelProvider && teamRuntimeConfig.baseUrl) {
    args.push(
      "-c",
      `model_providers.${teamRuntimeConfig.modelProvider}.name=${quoteTomlString(teamRuntimeConfig.modelProvider)}`,
    );
    args.push(
      "-c",
      `model_providers.${teamRuntimeConfig.modelProvider}.base_url=${quoteTomlString(teamRuntimeConfig.baseUrl)}`,
    );
    args.push(
      "-c",
      `model_providers.${teamRuntimeConfig.modelProvider}.wire_api="responses"`,
    );
    args.push(
      "-c",
      `model_providers.${teamRuntimeConfig.modelProvider}.requires_openai_auth=true`,
    );
  }

  args.push(prompt);
  return args;
};

const writeTemporaryAuthFile = async (codexHome: string): Promise<void> => {
  if (!teamRuntimeConfig.apiKey) {
    return;
  }

  await fs.writeFile(
    path.join(codexHome, "auth.json"),
    JSON.stringify(
      {
        auth_mode: "apikey",
        OPENAI_API_KEY: teamRuntimeConfig.apiKey,
      },
      null,
      2,
    ),
    "utf8",
  );
};

const linkSkillEntries = async ({
  sourceRoot,
  targetRoot,
  overwrite,
}: {
  sourceRoot: string;
  targetRoot: string;
  overwrite: boolean;
}): Promise<void> => {
  let entries;
  try {
    entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  } catch {
    return;
  }

  await fs.mkdir(targetRoot, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const targetPath = path.join(targetRoot, entry.name);

    if (overwrite) {
      await fs.rm(targetPath, {
        force: true,
        recursive: true,
      });
    } else {
      try {
        await fs.lstat(targetPath);
        continue;
      } catch {
        // Continue and create the link below.
      }
    }

    await fs.symlink(sourcePath, targetPath, entry.isDirectory() ? "dir" : "file");
  }
};

const prepareCodexHome = async ({
  codexHome,
}: {
  codexHome: string;
}): Promise<void> => {
  await fs.mkdir(codexHome, { recursive: true });
  await writeTemporaryAuthFile(codexHome);

  const skillsRoot = path.join(codexHome, "skills");
  await linkSkillEntries({
    sourceRoot: GLOBAL_CODEX_SKILLS_ROOT,
    targetRoot: skillsRoot,
    overwrite: false,
  });
  await linkSkillEntries({
    sourceRoot: REPOSITORY_CODEX_SKILLS_ROOT,
    targetRoot: skillsRoot,
    overwrite: true,
  });
};

export const runCodexStructuredOutput = async <TSchema extends z.ZodTypeAny>({
  worktreePath,
  prompt,
  responseSchema,
  outputJsonSchema,
  codexHomePrefix,
  onEvent,
}: {
  worktreePath: string;
  prompt: string;
  responseSchema: TSchema;
  outputJsonSchema: object;
  codexHomePrefix: string;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
}): Promise<z.infer<TSchema>> => {
  const codexHomeRoot = path.join(path.dirname(worktreePath), ".codex-runner-home");
  await fs.mkdir(codexHomeRoot, { recursive: true });
  const codexHome = await fs.mkdtemp(path.join(codexHomeRoot, `${codexHomePrefix}-`));
  const schemaPath = path.join(codexHome, "output-schema.json");
  const outputPath = path.join(codexHome, "output.json");

  await prepareCodexHome({
    codexHome,
  });
  await fs.writeFile(schemaPath, JSON.stringify(outputJsonSchema, null, 2), "utf8");

  try {
    const args = buildCodexExecArgs({
      worktreePath,
      schemaPath,
      outputPath,
      prompt,
    });
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let stdoutRemainder = "";
    let stderrRemainder = "";
    let eventQueue = Promise.resolve();

    const queueEvent = (event: TeamCodexEvent): void => {
      if (!event.message.trim()) {
        return;
      }

      eventQueue = eventQueue.then(async () => {
        try {
          await onEvent?.(event);
        } catch (error) {
          throw new Error(
            `Codex event handling failed: ${
              error instanceof Error ? error.message : "Unknown error."
            }`,
          );
        }
      });
    };

    const queueBufferedLines = ({
      source,
      chunk,
      remainder,
    }: {
      source: TeamCodexLogSource;
      chunk: string;
      remainder: string;
    }): string => {
      const combined = `${remainder}${chunk}`;
      const lines = combined.split(/\r?\n/u);
      const nextRemainder = lines.pop() ?? "";

      for (const line of lines) {
        const message = line.trimEnd();
        if (!message.trim()) {
          continue;
        }

        queueEvent(
          createCodexEvent({
            source,
            message,
          }),
        );
      }

      return nextRemainder;
    };

    const flushRemainder = ({
      source,
      remainder,
    }: {
      source: TeamCodexLogSource;
      remainder: string;
    }): void => {
      const message = remainder.trimEnd();
      if (!message.trim()) {
        return;
      }

      queueEvent(
        createCodexEvent({
          source,
          message,
        }),
      );
    };

    queueEvent(
      createCodexEvent({
        source: "system",
        message: `Launching Codex CLI in ${worktreePath}.`,
      }),
    );

    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn("codex", args, {
        cwd: worktreePath,
        env: {
          ...process.env,
          CODEX_HOME: codexHome,
          OPENAI_API_KEY: teamRuntimeConfig.apiKey ?? process.env.OPENAI_API_KEY ?? "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");

      child.stdout?.on("data", (chunk: string) => {
        stdoutBuffer += chunk;
        stdoutRemainder = queueBufferedLines({
          source: "stdout",
          chunk,
          remainder: stdoutRemainder,
        });
      });

      child.stderr?.on("data", (chunk: string) => {
        stderrBuffer += chunk;
        stderrRemainder = queueBufferedLines({
          source: "stderr",
          chunk,
          remainder: stderrRemainder,
        });
      });

      child.on("error", reject);
      child.on("close", (code) => {
        flushRemainder({
          source: "stdout",
          remainder: stdoutRemainder,
        });
        flushRemainder({
          source: "stderr",
          remainder: stderrRemainder,
        });
        resolve(code ?? 0);
      });
    });

    queueEvent(
      createCodexEvent({
        source: "system",
        message:
          exitCode === 0
            ? "Codex CLI completed successfully."
            : `Codex CLI exited with status ${exitCode}.`,
      }),
    );

    await eventQueue;

    const rawMessage = await fs.readFile(outputPath, "utf8");
    if (exitCode !== 0) {
      throw new Error(
        trimErrorOutput([stderrBuffer, stdoutBuffer].filter(Boolean).join("\n")) ||
          `Codex CLI exited with status ${exitCode}.`,
      );
    }

    return parseStructuredMessage(rawMessage || stdoutBuffer, responseSchema);
  } catch (error) {
    const isEventHandlingError =
      error instanceof Error && error.message.startsWith("Codex event handling failed:");

    if (!isEventHandlingError) {
      try {
        const rawMessage = await fs.readFile(outputPath, "utf8");
        return parseStructuredMessage(rawMessage, responseSchema);
      } catch {
        // Fall through to the richer execution error below.
      }
    }

    const message =
      error instanceof Error ? error.message : "Codex CLI execution failed without any captured output.";
    throw new Error(message);
  } finally {
    await fs.rm(codexHome, {
      force: true,
      recursive: true,
    });
  }
};

const codexLaneOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "deliverable",
    "decision",
    "pullRequestTitle",
    "pullRequestSummary",
  ],
  properties: {
    summary: {
      type: "string",
      minLength: 1,
    },
    deliverable: {
      type: "string",
      minLength: 1,
    },
    decision: {
      type: "string",
      enum: ["continue", "approved", "needs_revision"],
    },
    pullRequestTitle: {
      type: ["string", "null"],
      minLength: 1,
    },
    pullRequestSummary: {
      type: ["string", "null"],
      minLength: 1,
    },
  },
} as const;

export const runCodexLaneRole = async ({
  worktreePath,
  prompt,
  onEvent,
}: {
  worktreePath: string;
  prompt: string;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
}): Promise<CodexLaneResponse> => {
  return runCodexStructuredOutput({
    worktreePath,
    prompt,
    responseSchema: codexLaneResponseSchema,
    outputJsonSchema: codexLaneOutputJsonSchema,
    codexHomePrefix: "lane",
    onEvent,
  });
};
