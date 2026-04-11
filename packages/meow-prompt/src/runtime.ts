export type PipeArgument = boolean | number | string;

export type CompiledPlaceholder = {
  name: string;
  pipeArgs: readonly PipeArgument[];
  pipeName: string | null;
};

export type CompiledTemplate = {
  placeholders: readonly CompiledPlaceholder[];
  segments: readonly string[];
};

export type PromptArgsRecord = Record<string, unknown>;

type PromptInput = PromptArgsRecord | ((frontmatter: unknown) => PromptArgsRecord);

type PromptPipe = (value: unknown, args: readonly PipeArgument[]) => string;

const stringifyPromptValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  return JSON.stringify(value, null, 2) ?? "";
};

const renderRawPipe: PromptPipe = (value, args) => {
  if (args.length === 0) {
    return typeof value === "string" ? value : stringifyPromptValue(value);
  }

  if (args.length === 1 && args[0] === "json") {
    return JSON.stringify(value, null, 2) ?? "null";
  }

  throw new Error(
    `Unsupported raw pipe signature: raw(${args.map((argument) => JSON.stringify(argument)).join(", ")})`,
  );
};

const builtinPipes: Record<string, PromptPipe> = {
  raw: renderRawPipe,
};

const getPromptValue = (args: PromptArgsRecord, name: string): unknown => {
  if (!(name in args)) {
    throw new Error(`Missing prompt argument "${name}".`);
  }

  return args[name];
};

export const renderCompiledTemplate = (
  compiledTemplate: CompiledTemplate,
  args: PromptArgsRecord,
): string => {
  const parts: string[] = [];

  for (let index = 0; index < compiledTemplate.placeholders.length; index += 1) {
    parts.push(compiledTemplate.segments[index] ?? "");

    const placeholder = compiledTemplate.placeholders[index];
    const value = getPromptValue(args, placeholder.name);

    if (!placeholder.pipeName) {
      parts.push(stringifyPromptValue(value));
      continue;
    }

    const pipe = builtinPipes[placeholder.pipeName];

    if (!pipe) {
      throw new Error(`Unknown prompt pipe "${placeholder.pipeName}".`);
    }

    parts.push(pipe(value, placeholder.pipeArgs));
  }

  parts.push(compiledTemplate.segments[compiledTemplate.segments.length - 1] ?? "");

  return parts.join("");
};

export const createPromptRenderer = (
  compiledTemplate: CompiledTemplate,
  frontmatter: unknown,
): ((input?: PromptInput) => string) => {
  return (input?: PromptInput): string => {
    const resolvedArgs =
      typeof input === "function"
        ? (input(frontmatter) as PromptArgsRecord)
        : ((input ?? {}) as PromptArgsRecord);

    return renderCompiledTemplate(compiledTemplate, resolvedArgs);
  };
};
