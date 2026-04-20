import "server-only";

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { getTeamRuntimeConfig, type TeamRuntimeConfig } from "@/lib/config/runtime";
import type { Worktree } from "@/lib/team/coding/worktree";
import type { TeamCodexEvent, TeamCodexLogSource } from "@/lib/team/types";

const ERROR_OUTPUT_LINE_LIMIT = 80;
const GLOBAL_CODEX_SKILLS_ROOT = path.join(homedir(), ".codex", "skills");
const REPOSITORY_CODEX_SKILLS_ROOTS = [
  path.join(process.cwd(), ".codex", "skills"),
  path.join(process.cwd(), "skills"),
];

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

const readOptionalFile = async (filePath: string): Promise<string | null> => {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return null;
    }

    throw error;
  }
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
  worktree,
  schemaPath,
  outputPath,
  prompt,
  runtimeConfig,
}: {
  worktree: Worktree;
  schemaPath: string;
  outputPath: string;
  prompt: string;
  runtimeConfig: TeamRuntimeConfig;
}): string[] => {
  const args = [
    "exec",
    "--cd",
    worktree.path,
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
    runtimeConfig.model,
  ];

  if (runtimeConfig.modelProvider) {
    args.push("-c", `model_provider=${quoteTomlString(runtimeConfig.modelProvider)}`);
  }

  args.push("-c", `model_reasoning_effort=${quoteTomlString(runtimeConfig.reasoningEffort)}`);
  args.push("-c", "disable_response_storage=true");
  args.push("-c", 'network_access="enabled"');

  if (runtimeConfig.modelProvider && runtimeConfig.baseUrl) {
    args.push(
      "-c",
      `model_providers.${runtimeConfig.modelProvider}.name=${quoteTomlString(runtimeConfig.modelProvider)}`,
    );
    args.push(
      "-c",
      `model_providers.${runtimeConfig.modelProvider}.base_url=${quoteTomlString(runtimeConfig.baseUrl)}`,
    );
    args.push("-c", `model_providers.${runtimeConfig.modelProvider}.wire_api="responses"`);
    args.push("-c", `model_providers.${runtimeConfig.modelProvider}.requires_openai_auth=true`);
  }

  args.push(prompt);
  return args;
};

const writeTemporaryAuthFile = async ({
  codexHome,
  runtimeConfig,
}: {
  codexHome: string;
  runtimeConfig: TeamRuntimeConfig;
}): Promise<void> => {
  if (!runtimeConfig.apiKey) {
    return;
  }

  await fs.writeFile(
    path.join(codexHome, "auth.json"),
    JSON.stringify(
      {
        auth_mode: "apikey",
        OPENAI_API_KEY: runtimeConfig.apiKey,
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
  runtimeConfig,
}: {
  codexHome: string;
  runtimeConfig: TeamRuntimeConfig;
}): Promise<void> => {
  await fs.mkdir(codexHome, { recursive: true });
  await writeTemporaryAuthFile({
    codexHome,
    runtimeConfig,
  });

  const skillsRoot = path.join(codexHome, "skills");
  await linkSkillEntries({
    sourceRoot: GLOBAL_CODEX_SKILLS_ROOT,
    targetRoot: skillsRoot,
    overwrite: false,
  });
  for (const sourceRoot of REPOSITORY_CODEX_SKILLS_ROOTS) {
    await linkSkillEntries({
      sourceRoot,
      targetRoot: skillsRoot,
      overwrite: true,
    });
  }
};

export const runCodexStructuredOutput = async <TSchema extends z.ZodTypeAny>({
  worktree,
  prompt,
  responseSchema,
  codexHomePrefix,
  onEvent,
}: {
  worktree: Worktree;
  prompt: string;
  responseSchema: TSchema;
  codexHomePrefix: string;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
}): Promise<z.infer<TSchema>> => {
  const codexHomeRoot = path.join(path.dirname(worktree.path), ".codex-runner-home");
  await fs.mkdir(codexHomeRoot, { recursive: true });
  const codexHome = await fs.mkdtemp(path.join(codexHomeRoot, `${codexHomePrefix}-`));
  const schemaPath = path.join(codexHome, "output-schema.json");
  const outputPath = path.join(codexHome, "output.json");
  let stdoutBuffer = "";
  const runtimeConfig = getTeamRuntimeConfig();

  await prepareCodexHome({
    codexHome,
    runtimeConfig,
  });
  const outputJsonSchema = z.toJSONSchema(responseSchema);
  await fs.writeFile(schemaPath, JSON.stringify(outputJsonSchema, null, 2), "utf8");

  try {
    const args = buildCodexExecArgs({
      worktree,
      schemaPath,
      outputPath,
      prompt,
      runtimeConfig,
    });
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
        message: `Launching Codex CLI in ${worktree.path}.`,
      }),
    );

    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn("codex", args, {
        cwd: worktree.path,
        env: {
          ...process.env,
          CODEX_HOME: codexHome,
          OPENAI_API_KEY: runtimeConfig.apiKey ?? process.env.OPENAI_API_KEY ?? "",
          OPENSPEC_TELEMETRY: "0",
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

    if (exitCode !== 0) {
      throw new Error(
        trimErrorOutput([stderrBuffer, stdoutBuffer].filter(Boolean).join("\n")) ||
          `Codex CLI exited with status ${exitCode}.`,
      );
    }

    const rawMessage = await readOptionalFile(outputPath);
    const structuredMessage = rawMessage ?? stdoutBuffer;

    if (!structuredMessage.trim()) {
      throw new Error("Codex CLI completed without producing structured output.");
    }

    return parseStructuredMessage(structuredMessage, responseSchema);
  } catch (error) {
    const isEventHandlingError =
      error instanceof Error && error.message.startsWith("Codex event handling failed:");

    if (!isEventHandlingError) {
      try {
        const rawMessage = await readOptionalFile(outputPath);
        const structuredMessage = rawMessage ?? stdoutBuffer;

        if (structuredMessage.trim()) {
          return parseStructuredMessage(structuredMessage, responseSchema);
        }
      } catch {
        // Fall through to the richer execution error below.
      }
    }

    const message =
      error instanceof Error
        ? error.message
        : "Codex CLI execution failed without any captured output.";
    throw new Error(message);
  } finally {
    await fs.rm(codexHome, {
      force: true,
      recursive: true,
    });
  }
};

export const runCodexLaneRole = async ({
  worktree,
  prompt,
  onEvent,
}: {
  worktree: Worktree;
  prompt: string;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
}): Promise<CodexLaneResponse> => {
  return runCodexStructuredOutput({
    worktree,
    prompt,
    responseSchema: codexLaneResponseSchema,
    codexHomePrefix: "lane",
    onEvent,
  });
};
