type EnvLike = Record<string, string | undefined>;

const TRUE_VALUES = new Set(["1", "true", "yes", "y", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "n", "off"]);

export function parseOptionalBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return undefined;
}

export function resolvePlaywrightSpeechEnabled(env: EnvLike): boolean {
  return parseOptionalBooleanEnv(env.E2E_ENABLE_SPEECH) ?? false;
}
