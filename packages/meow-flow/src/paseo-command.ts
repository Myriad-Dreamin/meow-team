export type PaseoCommandInvocation = {
  readonly command: string;
  readonly argsPrefix: readonly string[];
};

export function resolvePaseoCommandInvocation(): PaseoCommandInvocation {
  const overrideCommand = process.env.MFL_PASEO_BIN?.trim();

  if (overrideCommand) {
    return {
      command: overrideCommand,
      argsPrefix: [],
    };
  }

  return {
    command: "paseo",
    argsPrefix: [],
  };
}
