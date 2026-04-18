export const TEAM_EXECUTION_MODES = ["execution", "benchmark", "experiment"] as const;

export type TeamExecutionMode = (typeof TEAM_EXECUTION_MODES)[number];

export type TeamExecutionModeParseResult = {
  executionMode: TeamExecutionMode | null;
  requestText: string;
  prefix: string | null;
};

const EXECUTION_MODE_PREFIX_PATTERN = /^(execution|benchmark|experiment)\s*:\s*([\s\S]*)$/iu;

export const normalizeTeamExecutionMode = (
  value: string | null | undefined,
): TeamExecutionMode | null => {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return TEAM_EXECUTION_MODES.includes(normalized as TeamExecutionMode)
    ? (normalized as TeamExecutionMode)
    : null;
};

export const parseExecutionModeInput = (
  value: string | null | undefined,
): TeamExecutionModeParseResult => {
  const normalized = value?.trim() ?? "";
  const match = normalized.match(EXECUTION_MODE_PREFIX_PATTERN);
  const executionMode = normalizeTeamExecutionMode(match?.[1] ?? null);
  const requestText = match?.[2]?.trim() ?? normalized;

  return {
    executionMode,
    requestText: requestText || normalized,
    prefix: executionMode ? `${executionMode}:` : null,
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
