import { Command } from "clipanion";
import type { MeowTeamCliContext } from "../app.ts";

export class ConfigCommand extends Command<MeowTeamCliContext> {
  static paths = [["config"]];

  static usage = Command.Usage({
    category: "Configuration",
    description: "Show the available repository-local configuration commands.",
    examples: [
      ["Set the current repository platform", "$0 config platform github"],
      ["Set the ugit browser base URL", "$0 config ugit base-url http://localhost:17121/"],
    ],
  });

  async execute(): Promise<number> {
    this.context.stdout.write(
      [
        "Use one of:",
        "  meow-team config platform <github|ugit>",
        "  meow-team config ugit base-url <url>",
      ].join("\n"),
    );
    this.context.stdout.write("\n");
    return 0;
  }
}
