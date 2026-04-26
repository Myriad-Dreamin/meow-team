import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { EMBEDDED_SKILLS, type EmbeddedSkill } from "./embedded-skills.js";

type SupportedSkillProvider = "agents" | "claude" | "codex" | "opencode";

type SkillInstallTarget = {
  readonly provider: SupportedSkillProvider;
  readonly skillsDir: string;
};

export type SkillInstallResult = SkillInstallTarget & {
  readonly skillCount: number;
  readonly skillNames: readonly string[];
};

type InstallSkillsOptions = {
  readonly list?: boolean;
};

const SUPPORTED_PROVIDERS = ["claude", "codex", "opencode", "agents"] as const;

export function createInstallSkillsCommand(): Command {
  const installSkillsCommand = new Command("install-skills")
    .description("Install embedded MeowFlow skills for one or more LLM providers")
    .argument("[providers...]", "provider(s) to install to: claude, codex, opencode")
    .option("--list", "list embedded skills without installing them")
    .action(async (providers?: readonly string[]) => {
      const providerList = Array.isArray(providers) ? providers : [];
      const options = installSkillsCommand.opts<InstallSkillsOptions>();

      try {
        if (options.list === true || providerList.length === 0) {
          writeEmbeddedSkillsList();
          return;
        }

        const results = await installEmbeddedSkills({ providers: providerList });

        for (const result of results) {
          process.stdout.write(
            `Installed ${result.skillCount} skills for ${result.provider} at ${result.skillsDir}\n`,
          );
          writeSkillNames(result.skillNames);
        }
      } catch (error) {
        installSkillsCommand.error(error instanceof Error ? error.message : String(error));
      }
    });

  return installSkillsCommand;
}

export async function installEmbeddedSkills(input: {
  readonly providers: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}): Promise<readonly SkillInstallResult[]> {
  const env = input.env ?? process.env;
  const providers = normalizeProviders(input.providers);
  const targets = providers.map((provider) => resolveProviderTarget(provider, env));

  for (const target of targets) {
    await installSkillsToDirectory(EMBEDDED_SKILLS, target.skillsDir);
  }

  return targets.map((target) => ({
    ...target,
    skillCount: EMBEDDED_SKILLS.length,
    skillNames: getEmbeddedSkillNames(),
  }));
}

function writeEmbeddedSkillsList(): void {
  process.stdout.write("Embedded MeowFlow skills:\n");
  writeSkillNames(getEmbeddedSkillNames());

  process.stdout.write("\nInstall with: mfl install-skills <provider...>\n");
  process.stdout.write(`Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}\n`);
}

function writeSkillNames(skillNames: readonly string[]): void {
  for (const skillName of skillNames) {
    process.stdout.write(`  ${skillName}\n`);
  }
}

function getEmbeddedSkillNames(): readonly string[] {
  return EMBEDDED_SKILLS.map((skill) => skill.name);
}

function normalizeProviders(rawProviders: readonly string[]): readonly SupportedSkillProvider[] {
  const providers: SupportedSkillProvider[] = [];
  const seenProviders = new Set<SupportedSkillProvider>();

  for (const rawProvider of rawProviders) {
    const provider = normalizeProvider(rawProvider);

    if (seenProviders.has(provider)) {
      continue;
    }

    seenProviders.add(provider);
    providers.push(provider);
  }

  if (providers.length === 0) {
    throw new Error(
      `Please provide at least one LLM provider. Example: mfl install-skills codex claude`,
    );
  }

  return providers;
}

function normalizeProvider(rawProvider: string): SupportedSkillProvider {
  const provider = rawProvider.trim().toLowerCase().split("/", 1)[0] ?? "";

  switch (provider) {
    case "agent":
    case "agents":
    case "shared":
      return "agents";
    case "claude":
    case "claude-code":
      return "claude";
    case "codex":
    case "openai-codex":
      return "codex";
    case "open-code":
    case "opencode":
      return "opencode";
    default:
      throw new Error(
        `Unsupported LLM provider "${rawProvider}". Supported providers: ${SUPPORTED_PROVIDERS.join(
          ", ",
        )}.`,
      );
  }
}

function resolveProviderTarget(
  provider: SupportedSkillProvider,
  env: NodeJS.ProcessEnv,
): SkillInstallTarget {
  const homeDirectory = resolveHomeDirectory(env);

  switch (provider) {
    case "agents":
      return {
        provider,
        skillsDir: path.join(
          readNonEmptyEnv(env.AGENTS_HOME) ?? path.join(homeDirectory, ".agents"),
          "skills",
        ),
      };
    case "claude":
      return {
        provider,
        skillsDir: path.join(
          readNonEmptyEnv(env.CLAUDE_CONFIG_DIR) ?? path.join(homeDirectory, ".claude"),
          "skills",
        ),
      };
    case "codex":
      return {
        provider,
        skillsDir: path.join(
          readNonEmptyEnv(env.CODEX_HOME) ?? path.join(homeDirectory, ".codex"),
          "skills",
        ),
      };
    case "opencode":
      return {
        provider,
        skillsDir: path.join(
          readNonEmptyEnv(env.OPENCODE_CONFIG_DIR) ??
            path.join(homeDirectory, ".config", "opencode"),
          "skills",
        ),
      };
  }
}

function readNonEmptyEnv(value: string | undefined): string | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  return value;
}

function resolveHomeDirectory(env: NodeJS.ProcessEnv): string {
  return readNonEmptyEnv(env.HOME) ?? readNonEmptyEnv(env.USERPROFILE) ?? os.homedir();
}

async function installSkillsToDirectory(
  skills: readonly EmbeddedSkill[],
  skillsDir: string,
): Promise<void> {
  await fs.mkdir(skillsDir, { recursive: true });

  for (const skill of skills) {
    validateEmbeddedSkillName(skill.name);

    const skillDir = path.join(skillsDir, skill.name);

    await fs.rm(skillDir, { recursive: true, force: true });

    for (const file of skill.files) {
      validateEmbeddedSkillPath(file.path);

      const destination = path.join(skillDir, ...file.path.split("/"));
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, file.content, "utf8");
    }
  }
}

function validateEmbeddedSkillName(skillName: string): void {
  if (
    skillName.length === 0 ||
    skillName.includes("\0") ||
    skillName.includes("/") ||
    skillName.includes("\\") ||
    skillName === "." ||
    skillName === ".."
  ) {
    throw new Error(`Invalid embedded skill name: ${skillName}`);
  }
}

function validateEmbeddedSkillPath(relativePath: string): void {
  const normalizedPath = path.posix.normalize(relativePath);

  if (
    relativePath.length === 0 ||
    relativePath.includes("\0") ||
    path.posix.isAbsolute(relativePath) ||
    normalizedPath !== relativePath ||
    normalizedPath === "." ||
    normalizedPath.startsWith("../")
  ) {
    throw new Error(`Invalid embedded skill file path: ${relativePath}`);
  }
}
