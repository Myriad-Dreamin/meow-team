import { Command } from "commander";
import { openThreadOccupationStore } from "./thread-occupation-store.js";

export function createDeleteCommand(): Command {
  return new Command("delete")
    .description("Release one or more persisted Meow Flow thread workspace occupations")
    .argument("<ids...>", "thread ids to release")
    .action((threadIds: string[]) => {
      const store = openThreadOccupationStore();

      try {
        const releasedOccupations = store.deleteThreadOccupations(threadIds);
        const output = releasedOccupations
          .map(
            (occupation) => `${occupation.threadId} released ${occupation.workspaceRelativePath}`,
          )
          .join("\n");

        process.stdout.write(`${output}\n`);
      } finally {
        store.close();
      }
    });
}
