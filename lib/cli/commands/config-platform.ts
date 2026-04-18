import { Command, Option, UsageError } from "clipanion/lib/advanced/index.js";
import { writeRepositoryPlatformConfig } from "../../config/repository.ts";
import { gitPlatformIds, isGitPlatformId } from "../../platform/types.ts";
import type { MeowTeamCliContext } from "../app.ts";

export class ConfigPlatformCommand extends Command<MeowTeamCliContext> {
  static paths = [["config", "platform"]];

  static usage = Command.Usage({
    category: "Configuration",
    description: "Persist the Git platform for the current repository.",
    details:
      "Writes `meow-team.platform` to the local Git config of the repository or worktree that contains the current working directory.",
    examples: [
      ["Select GitHub for the current repository", "$0 config platform github"],
      ["Record ugit before the adapter exists", "$0 config platform ugit"],
    ],
  });

  platform = Option.String({ required: true });

  async execute(): Promise<number> {
    if (!isGitPlatformId(this.platform)) {
      throw new UsageError(
        `Unsupported platform "${this.platform}". Use one of: ${gitPlatformIds.join(", ")}.`,
      );
    }

    try {
      const { platform } = await writeRepositoryPlatformConfig({
        cwd: this.context.cwd,
        platform: this.platform,
      });
      this.context.stdout.write(`Repository platform is now ${platform}.\n`);
      return 0;
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
}
