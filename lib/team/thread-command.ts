import type { TeamDispatchAssignment, TeamWorkerLaneRecord } from "@/lib/team/types";
export {
  getApproveCommandSkipReason,
  getAssignmentThreadCommandDisabledReason,
  getCancelCommandSkipReason,
  getRetryCommandSkipReason,
  getReadyCommandSkipReason,
  getReplanCommandSkipReason,
  getThreadCommandDisabledReason,
  THREAD_COMMAND_ARCHIVED_REASON,
  THREAD_COMMAND_BUSY_REASON,
  THREAD_COMMAND_NO_ASSIGNMENT_REASON,
  THREAD_COMMAND_REPLANNING_REASON,
} from "@/lib/team/thread-command-eligibility";

type ThreadCommandKind = "approve" | "ready" | "retry" | "cancel" | "replan" | "replan-all";
type ProposalNumberMode = "none" | "optional" | "required";

type ThreadCommandDefinition = {
  kind: ThreadCommandKind;
  command: `/${ThreadCommandKind}`;
  syntax: string;
  proposalNumberMode: ProposalNumberMode;
  requiresRequirement: boolean;
};

type ProposalLaneLike = Pick<
  TeamWorkerLaneRecord,
  "laneId" | "laneIndex" | "proposalChangeName" | "status" | "taskObjective" | "taskTitle"
>;

type AutocompleteToken = {
  end: number;
  start: number;
  text: string;
};

export const THREAD_COMMAND_DEFINITIONS: ThreadCommandDefinition[] = [
  {
    kind: "approve",
    command: "/approve",
    syntax: "/approve [proposal-number]",
    proposalNumberMode: "optional",
    requiresRequirement: false,
  },
  {
    kind: "ready",
    command: "/ready",
    syntax: "/ready [proposal-number]",
    proposalNumberMode: "optional",
    requiresRequirement: false,
  },
  {
    kind: "retry",
    command: "/retry",
    syntax: "/retry [proposal-number]",
    proposalNumberMode: "optional",
    requiresRequirement: false,
  },
  {
    kind: "cancel",
    command: "/cancel",
    syntax: "/cancel",
    proposalNumberMode: "none",
    requiresRequirement: false,
  },
  {
    kind: "replan",
    command: "/replan",
    syntax: "/replan [proposal-number] requirement",
    proposalNumberMode: "required",
    requiresRequirement: true,
  },
  {
    kind: "replan-all",
    command: "/replan-all",
    syntax: "/replan-all requirement",
    proposalNumberMode: "none",
    requiresRequirement: true,
  },
];

const THREAD_COMMAND_DEFINITION_BY_COMMAND = new Map(
  THREAD_COMMAND_DEFINITIONS.map((definition) => [definition.command, definition]),
);

const joinThreadCommandList = (items: string[]): string => {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} or ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, or ${items.at(-1)}`;
};

const SUPPORTED_THREAD_COMMANDS_TEXT = joinThreadCommandList(
  THREAD_COMMAND_DEFINITIONS.map((definition) => definition.command),
);

type ProposalCommandName = Extract<ThreadCommandKind, "approve" | "ready" | "retry">;

type ProposalThreadCommand = {
  kind: "approve";
  original: string;
  proposalNumber: number | null;
};

type ReadyThreadCommand = {
  kind: "ready";
  original: string;
  proposalNumber: number | null;
};

type RetryThreadCommand = {
  kind: "retry";
  original: string;
  proposalNumber: number | null;
};

export type ThreadCommand =
  | ProposalThreadCommand
  | ReadyThreadCommand
  | RetryThreadCommand
  | {
      kind: "cancel";
      original: string;
    }
  | {
      kind: "replan";
      original: string;
      proposalNumber: number;
      requirement: string;
    }
  | {
      kind: "replan-all";
      original: string;
      requirement: string;
    };

export type ThreadCommandAutocompleteSuggestion = {
  detail: string;
  insertText: string;
  kind: "command" | "proposal";
  label: string;
};

export type ThreadCommandAutocompleteResult = {
  from: number;
  suggestions: ThreadCommandAutocompleteSuggestion[];
  to: number;
};

export class ThreadCommandParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThreadCommandParseError";
  }
}

const parsePositiveInteger = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  return Number.parseInt(value, 10);
};

const getThreadCommandDefinition = (command: string): ThreadCommandDefinition | null => {
  return (
    THREAD_COMMAND_DEFINITION_BY_COMMAND.get(command as ThreadCommandDefinition["command"]) ?? null
  );
};

const buildInvalidSyntaxMessage = (command: ThreadCommandDefinition["command"]) => {
  const definition = getThreadCommandDefinition(command);
  if (!definition) {
    return `Unsupported command. Use ${SUPPORTED_THREAD_COMMANDS_TEXT}.`;
  }

  return `Invalid syntax for ${definition.command}. Use ${definition.syntax}.`;
};

const parseProposalCommand = (
  kind: ProposalCommandName,
  original: string,
  remainder: string,
): ThreadCommand => {
  if (!remainder) {
    return {
      kind,
      original,
      proposalNumber: null,
    };
  }

  const proposalNumber = parsePositiveInteger(remainder);
  if (!proposalNumber) {
    throw new ThreadCommandParseError(buildInvalidSyntaxMessage(`/${kind}`));
  }

  return {
    kind,
    original,
    proposalNumber,
  };
};

export const parseThreadCommand = (input: string): ThreadCommand => {
  const original = input.trim();
  if (!original) {
    throw new ThreadCommandParseError("Enter a slash command.");
  }

  const [keyword = "", ...restTokens] = original.split(/\s+/);
  const remainder = restTokens.join(" ").trim();

  switch (keyword) {
    case "/approve":
      return parseProposalCommand("approve", original, remainder);
    case "/ready":
      return parseProposalCommand("ready", original, remainder);
    case "/retry":
      return parseProposalCommand("retry", original, remainder);
    case "/cancel":
      if (remainder) {
        throw new ThreadCommandParseError(buildInvalidSyntaxMessage("/cancel"));
      }

      return {
        kind: "cancel",
        original,
      };
    case "/replan": {
      const [proposalToken = "", ...requirementTokens] = restTokens;
      const proposalNumber = parsePositiveInteger(proposalToken);
      const requirement = requirementTokens.join(" ").trim();
      if (!proposalNumber || !requirement) {
        throw new ThreadCommandParseError(buildInvalidSyntaxMessage("/replan"));
      }

      return {
        kind: "replan",
        original,
        proposalNumber,
        requirement,
      };
    }
    case "/replan-all": {
      if (!remainder) {
        throw new ThreadCommandParseError(buildInvalidSyntaxMessage("/replan-all"));
      }

      return {
        kind: "replan-all",
        original,
        requirement: remainder,
      };
    }
    default:
      throw new ThreadCommandParseError(
        `Unsupported command. Use ${SUPPORTED_THREAD_COMMANDS_TEXT}.`,
      );
  }
};

const tokenizeThreadCommandInput = (value: string): AutocompleteToken[] => {
  return Array.from(value.matchAll(/\S+/g), (match) => ({
    end: (match.index ?? 0) + match[0].length,
    start: match.index ?? 0,
    text: match[0],
  }));
};

const buildCommandAutocompleteSuggestions = (
  prefix: string,
): ThreadCommandAutocompleteSuggestion[] => {
  return THREAD_COMMAND_DEFINITIONS.filter((definition) =>
    definition.command.startsWith(prefix),
  ).map((definition) => ({
    detail: definition.syntax,
    insertText:
      definition.proposalNumberMode !== "none" || definition.requiresRequirement
        ? `${definition.command} `
        : definition.command,
    kind: "command",
    label: definition.command,
  }));
};

const buildProposalAutocompleteSuggestions = ({
  definition,
  prefix,
  proposalNumbers,
}: {
  definition: ThreadCommandDefinition;
  prefix: string;
  proposalNumbers: number[];
}): ThreadCommandAutocompleteSuggestion[] => {
  return [...new Set(proposalNumbers)]
    .sort((left, right) => left - right)
    .map((proposalNumber) => String(proposalNumber))
    .filter((proposalNumber) => proposalNumber.startsWith(prefix))
    .map((proposalNumber) => ({
      detail:
        definition.proposalNumberMode === "required"
          ? `${definition.command} continues with requirement text after proposal ${proposalNumber}.`
          : `${definition.command} targets proposal ${proposalNumber} on the latest assignment.`,
      insertText:
        definition.proposalNumberMode === "required" ? `${proposalNumber} ` : proposalNumber,
      kind: "proposal",
      label: `Proposal ${proposalNumber}`,
    }));
};

export const getThreadCommandAutocomplete = ({
  cursorIndex,
  proposalNumbers,
  value,
}: {
  cursorIndex: number;
  proposalNumbers: number[];
  value: string;
}): ThreadCommandAutocompleteResult | null => {
  if (cursorIndex < 0 || cursorIndex > value.length) {
    return null;
  }

  const tokens = tokenizeThreadCommandInput(value);
  const commandToken = tokens[0];
  if (!commandToken) {
    return null;
  }

  if (
    cursorIndex >= commandToken.start &&
    cursorIndex <= commandToken.end &&
    commandToken.text.startsWith("/")
  ) {
    const suggestions = buildCommandAutocompleteSuggestions(
      value.slice(commandToken.start, cursorIndex),
    );
    if (suggestions.length === 0) {
      return null;
    }

    return {
      from: commandToken.start,
      suggestions,
      to: commandToken.end,
    };
  }

  const definition = getThreadCommandDefinition(commandToken.text);
  if (!definition || definition.proposalNumberMode === "none") {
    return null;
  }

  const proposalToken = tokens[1];
  if (!proposalToken) {
    if (cursorIndex <= commandToken.end || /\S/.test(value.slice(commandToken.end, cursorIndex))) {
      return null;
    }

    const suggestions = buildProposalAutocompleteSuggestions({
      definition,
      prefix: "",
      proposalNumbers,
    });
    if (suggestions.length === 0) {
      return null;
    }

    return {
      from: cursorIndex,
      suggestions,
      to: cursorIndex,
    };
  }

  if (cursorIndex < proposalToken.start || cursorIndex > proposalToken.end) {
    return null;
  }

  const suggestions = buildProposalAutocompleteSuggestions({
    definition,
    prefix: value.slice(proposalToken.start, cursorIndex),
    proposalNumbers,
  });
  if (suggestions.length === 0) {
    return null;
  }

  return {
    from: proposalToken.start,
    suggestions,
    to: proposalToken.end,
  };
};

const isProposalLane = (
  lane: Pick<TeamWorkerLaneRecord, "proposalChangeName" | "status" | "taskObjective" | "taskTitle">,
): boolean => {
  return (
    lane.status !== "idle" ||
    Boolean(lane.proposalChangeName || lane.taskTitle || lane.taskObjective)
  );
};

export const sortProposalLanes = <TLane extends Pick<TeamWorkerLaneRecord, "laneId" | "laneIndex">>(
  lanes: TLane[],
): TLane[] => {
  return [...lanes].sort(
    (left, right) => left.laneIndex - right.laneIndex || left.laneId.localeCompare(right.laneId),
  );
};

export const getCommandProposalLanesFromLanes = <TLane extends ProposalLaneLike>(
  lanes: TLane[],
): TLane[] => {
  return sortProposalLanes(lanes.filter((lane) => isProposalLane(lane)));
};

export const getCommandProposalLanes = (
  assignment: Pick<TeamDispatchAssignment, "lanes">,
): TeamWorkerLaneRecord[] => {
  return getCommandProposalLanesFromLanes(assignment.lanes);
};

export const getThreadCommandProposalNumbers = <TLane extends ProposalLaneLike>(
  lanes: TLane[],
): number[] => {
  return getCommandProposalLanesFromLanes(lanes).map((lane) => lane.laneIndex);
};
