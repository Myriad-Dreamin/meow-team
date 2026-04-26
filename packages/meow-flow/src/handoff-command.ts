import { Command } from "commander";
import { resolveCurrentThread } from "./thread-command.js";
import {
  appendHandoffRecord,
  formatHandoffs,
  getThread,
  parseStage,
  readMeowFlowState,
  updateMeowFlowState,
} from "./thread-state.js";

type HandoffAppendOptions = {
  readonly stage?: string;
};

type HandoffGetOptions = {
  readonly count?: string;
  readonly since?: string;
};

export function createHandoffCommand(): Command {
  return new Command("handoff")
    .description("Append and read MeowFlow thread handoffs")
    .addCommand(createHandoffAppendCommand())
    .addCommand(createHandoffGetCommand());
}

function createHandoffAppendCommand(): Command {
  return new Command("append")
    .description("Append a stage handoff to the current MeowFlow thread")
    .requiredOption("--stage <stage>", "stage that produced this handoff")
    .argument("<content>", "compact handoff content")
    .action((content: string, options: HandoffAppendOptions, command: Command) => {
      try {
        const stage = parseStage(options.stage);
        if (!stage) {
          throw new Error("Stage is required.");
        }

        const trimmedContent = content.trim();
        if (trimmedContent.length === 0) {
          throw new Error("Handoff content must not be empty.");
        }

        const current = resolveCurrentThread("mfl handoff append");
        const now = new Date().toISOString();
        const handoff = updateMeowFlowState(current.context.repositoryRoot, (state) => {
          appendHandoffRecord(state, {
            threadId: current.threadId,
            stage,
            content: trimmedContent,
            now,
          });
        });
        const thread = getThread(handoff, current.threadId);
        const seq = thread?.handoffs.at(-1)?.seq;

        process.stdout.write(`seq: ${seq ?? "unknown"}\n`);
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      }
    });
}

function createHandoffGetCommand(): Command {
  return new Command("get")
    .description("Read recent handoffs from the current MeowFlow thread")
    .option("-n, --count <count>", "number of recent handoffs to read")
    .option("--since <seq>", "read handoffs starting at this sequence")
    .action((options: HandoffGetOptions, command: Command) => {
      try {
        if (options.count !== undefined && options.since !== undefined) {
          throw new Error("Use either -n/--count or --since, not both.");
        }

        const current = resolveCurrentThread("mfl handoff get");
        const state = readMeowFlowState(current.context.repositoryRoot);
        const thread = getThread(state, current.threadId);

        if (!thread) {
          throw new Error(`Thread not found: ${current.threadId}`);
        }

        const handoffs =
          options.since !== undefined
            ? thread.handoffs.filter((handoff) => handoff.seq >= parsePositiveInteger(options.since, "--since"))
            : thread.handoffs.slice(-parsePositiveInteger(options.count ?? "10", "-n/--count"));

        process.stdout.write(`${formatHandoffs(handoffs)}\n`);
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      }
    });
}

function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }

  return parsed;
}
