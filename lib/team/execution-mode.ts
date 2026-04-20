export const TEAM_EXECUTION_MODE_DEFINITIONS = [
  {
    detail: "Queue the standard execution workflow for implementation work.",
    mode: "execution",
    prefix: "/execution ",
  },
  {
    detail: "Queue the benchmark workflow for performance measurement work.",
    mode: "benchmark",
    prefix: "/benchmark ",
  },
  {
    detail: "Queue the experiment workflow for exploratory or data-gathering work.",
    mode: "experiment",
    prefix: "/experiment ",
  },
] as const;

export type TeamExecutionMode = (typeof TEAM_EXECUTION_MODE_DEFINITIONS)[number]["mode"];

export const TEAM_EXECUTION_MODES = TEAM_EXECUTION_MODE_DEFINITIONS.map(
  (definition) => definition.mode,
);

export type TeamExecutionModeParseResult = {
  executionMode: TeamExecutionMode | null;
  requestText: string;
  prefix: string | null;
};

export type TeamExecutionModeAutocompleteSuggestion = {
  detail: string;
  insertText: string;
  label: string;
  mode: TeamExecutionMode;
};

export type TeamExecutionModeAutocompleteResult = {
  from: number;
  suggestions: TeamExecutionModeAutocompleteSuggestion[];
  to: number;
};

const TEAM_EXECUTION_MODE_DEFINITION_BY_MODE = new Map(
  TEAM_EXECUTION_MODE_DEFINITIONS.map((definition) => [definition.mode, definition]),
);

const findExecutionModeDefinition = (
  value: string | null | undefined,
): (typeof TEAM_EXECUTION_MODE_DEFINITIONS)[number] | null => {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return TEAM_EXECUTION_MODE_DEFINITION_BY_MODE.get(normalized as TeamExecutionMode) ?? null;
};

const getExecutionModeAutocompleteTokenRange = (
  value: string,
  cursorIndex: number,
): {
  from: number;
  query: string;
  to: number;
} | null => {
  const clampedCursorIndex = Math.max(0, Math.min(cursorIndex, value.length));
  const leadingWhitespaceMatch = value.match(/^\s*/u);
  const tokenStart = leadingWhitespaceMatch?.[0].length ?? 0;

  if (clampedCursorIndex < tokenStart) {
    return null;
  }

  if (value[tokenStart] !== "/") {
    return null;
  }

  const tokenEndMatch = value.slice(tokenStart).match(/\s/u);
  const tokenEnd = tokenEndMatch ? tokenStart + (tokenEndMatch.index ?? 0) : value.length;

  if (clampedCursorIndex > tokenEnd) {
    return null;
  }

  return {
    from: tokenStart,
    query: value.slice(tokenStart, tokenEnd).toLowerCase(),
    to: tokenEnd,
  };
};

export const normalizeTeamExecutionMode = (
  value: string | null | undefined,
): TeamExecutionMode | null => {
  return findExecutionModeDefinition(value)?.mode ?? null;
};

export const parseExecutionModeInput = (
  value: string | null | undefined,
): TeamExecutionModeParseResult => {
  const rawValue = value ?? "";
  const normalized = rawValue.trim();
  const startBoundValue = rawValue.trimStart();
  const lowerStartBoundValue = startBoundValue.toLowerCase();

  for (const definition of TEAM_EXECUTION_MODE_DEFINITIONS) {
    if (!lowerStartBoundValue.startsWith(definition.prefix)) {
      continue;
    }

    const requestText = startBoundValue.slice(definition.prefix.length).trim();

    return {
      executionMode: definition.mode,
      requestText: requestText || normalized,
      prefix: definition.prefix,
    };
  }

  return {
    executionMode: null,
    requestText: normalized,
    prefix: null,
  };
};

export const getTeamExecutionModeAutocomplete = ({
  cursorIndex,
  value,
}: {
  cursorIndex: number;
  value: string;
}): TeamExecutionModeAutocompleteResult | null => {
  const tokenRange = getExecutionModeAutocompleteTokenRange(value, cursorIndex);

  if (!tokenRange) {
    return null;
  }

  const suggestions = TEAM_EXECUTION_MODE_DEFINITIONS.filter((definition) =>
    definition.prefix.startsWith(tokenRange.query),
  ).map((definition) => ({
    detail: definition.detail,
    insertText: definition.prefix,
    label: definition.prefix,
    mode: definition.mode,
  }));

  if (suggestions.length === 0) {
    return null;
  }

  return {
    from: tokenRange.from,
    suggestions,
    to: tokenRange.to,
  };
};

export const formatTeamExecutionModeLabel = (
  executionMode: TeamExecutionMode | null | undefined,
): string => {
  return executionMode ? executionMode.replace(/-/gu, " ") : "implementation";
};

export const buildExecutionModeGuidePath = (executionMode: TeamExecutionMode): string => {
  return `docs/guide/${executionMode}.md`;
};
