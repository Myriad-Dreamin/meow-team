import { Command } from "clipanion";
import type { MeowTeamCliContext } from "../app.ts";

export class ConfigCommand extends Command<MeowTeamCliContext> {
  static paths = [["config"]];

  static usage = Command.Usage({
    category: "Configuration",
    description: "Show the available repository-local configuration commands.",
    examples: [["Set the current repository platform", "$0 config platform github"]],
  });

  async execute(): Promise<number> {
    this.context.stdout.write("Use `meow-team config platform <github|ugit>`.\n");
    return 0;
  }
}
