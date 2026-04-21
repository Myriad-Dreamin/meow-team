import { Command, Option, UsageError } from "clipanion";
import { writeRepositoryUgitBrowserBaseUrl } from "../../config/repository.ts";
import type { MeowTeamCliContext } from "../app.ts";

export class ConfigUgitBaseUrlCommand extends Command<MeowTeamCliContext> {
  static paths = [["config", "ugit", "base-url"]];

  static usage = Command.Usage({
    category: "Configuration",
    description: "Persist the ugit browser base URL for the current repository.",
    details:
      "Writes `meow-team.ugit.base-url` to the local Git config of the repository or worktree that contains the current working directory.",
    examples: [
      [
        "Point ugit browser links at a local review server",
        "$0 config ugit base-url http://localhost:17121/",
      ],
    ],
  });

  baseUrl = Option.String({ required: true });

  async execute(): Promise<number> {
    try {
      const { baseUrl } = await writeRepositoryUgitBrowserBaseUrl({
        cwd: this.context.cwd,
        baseUrl: this.baseUrl,
      });
      this.context.stdout.write(`Repository ugit browser base URL is now ${baseUrl}.\n`);
      return 0;
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
}
