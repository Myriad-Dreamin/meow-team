import { Command, Option, UsageError } from "clipanion";
import {
  RepositoryNotFoundError,
  resolveGitRepositoryRoot,
  writeRepositoryPlatformId,
} from "../../repository-config/index.ts";
import { gitPlatformIds, isGitPlatformId } from "../../platform/types.ts";

const supportedPlatformList = gitPlatformIds.join(", ");

export class ConfigPlatformCommand extends Command {
  static paths = [["config", "platform"]];

  static usage = Command.Usage({
    category: "Config",
    description: "Persist the active git platform for the current repository.",
    details:
      "Resolves the git repository containing the current working directory and stores the selected platform in local git config under meow-team.platform.",
    examples: [
      ["Select GitHub for the current repository", "meow-team config platform github"],
      ["Prepare the current repository for future ugit support", "meow-team config platform ugit"],
    ],
  });

  platformId = Option.String({
    name: "platform-id",
  });

  async execute(): Promise<number> {
    const normalizedPlatformId = this.platformId.trim();
    if (!isGitPlatformId(normalizedPlatformId)) {
      throw new UsageError(
        `Unsupported platform "${this.platformId}". Expected one of: ${supportedPlatformList}.`,
      );
    }

    let repositoryPath: string;
    try {
      repositoryPath = await resolveGitRepositoryRoot(process.cwd());
    } catch (error) {
      if (error instanceof RepositoryNotFoundError) {
        throw new UsageError(error.message);
      }

      throw error;
    }

    await writeRepositoryPlatformId(repositoryPath, normalizedPlatformId);
    this.context.stdout.write(
      `Configured git platform "${normalizedPlatformId}" for ${repositoryPath}.\n`,
    );

    return 0;
  }
}
