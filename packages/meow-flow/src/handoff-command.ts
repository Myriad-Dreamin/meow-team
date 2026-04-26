import { Command } from "commander";
import { resolveCurrentThread } from "./thread-command.js";
import {
  appendHandoffRecord,
  formatHandoffs,
  getThread,
  parseStage,
  readMeowFlowState,
  updateMeowFlowState,
  withMeowFlowStateDatabase,
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

        const seq = withMeowFlowStateDatabase((database) => {
          const current = resolveCurrentThread("mfl handoff append", { database });
          const now = new Date().toISOString();
          const handoff = updateMeowFlowState(
            current.context.repositoryRoot,
            (state) => {
              appendHandoffRecord(state, {
                threadId: current.threadId,
                stage,
                content: trimmedContent,
                now,
              });
            },
            {
              database,
              threadIds: [current.threadId],
              includeOccupationThreads: false,
            },
          );
          const thread = getThread(handoff, current.threadId);
          return thread?.handoffs.at(-1)?.seq;
        });

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

        const resolved = withMeowFlowStateDatabase((database) => {
          const current = resolveCurrentThread("mfl handoff get", { database });
          const state = readMeowFlowState(current.context.repositoryRoot, {
            database,
            threadIds: [current.threadId],
            includeOccupationThreads: false,
          });
          return {
            thread: getThread(state, current.threadId),
            threadId: current.threadId,
          };
        });
        const thread = resolved.thread;

        if (!thread) {
          throw new Error(`Thread not found: ${resolved.threadId}`);
        }

        const since = options.since;
        const handoffs =
          since !== undefined
            ? thread.handoffs.filter(
                (handoff) => handoff.seq >= parsePositiveInteger(since, "--since"),
              )
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
