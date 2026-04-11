import path from "node:path";
import { extractFrontmatter, type FrontmatterValue } from "./frontmatter";
import {
  assertSupportedPromptPipe,
  type CompiledPlaceholder,
  type CompiledTemplate,
  type PipeArgument,
} from "./runtime";

export type CompiledPromptModule = {
  code: string;
  dts: string;
  frontmatter: Record<string, FrontmatterValue>;
  parameterNames: readonly string[];
};

const PLACEHOLDER_PREFIX = "[[param:";
const TEMPLATE_FILE_PATTERN = /\.(prompt|template)\.md$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const TEMPLATE_QUERY_PATTERN = /[?#].*$/;

type ParsedPipeExpression = {
  args: readonly PipeArgument[];
  name: string;
};

const escapePathForImport = (filePath: string): string => {
  const normalizedPath = filePath.replace(/\\/g, "/");
  return normalizedPath.startsWith(".") ? normalizedPath : `./${normalizedPath}`;
};

const createError = (resourcePath: string, message: string): Error => {
  return new Error(`${message} (${resourcePath})`);
};

const createPipeError = (resourcePath: string, error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  return createError(resourcePath, message);
};

const renderTypeScriptPropertyKey = (value: string): string => {
  return IDENTIFIER_PATTERN.test(value) ? value : JSON.stringify(value);
};

const assertIdentifier = (value: string, label: string, resourcePath: string): string => {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw createError(resourcePath, `Invalid ${label} "${value}".`);
  }

  return value;
};

const parsePipeString = (value: string, startIndex: number, resourcePath: string): string => {
  let result = "";
  let index = startIndex + 1;

  while (index < value.length) {
    const character = value[index];

    if (character === "'") {
      return result;
    }

    if (character !== "\\") {
      result += character;
      index += 1;
      continue;
    }

    index += 1;

    const escapedCharacter = value[index];

    if (escapedCharacter === undefined) {
      throw createError(resourcePath, "Invalid pipe string escape.");
    }

    switch (escapedCharacter) {
      case "n":
        result += "\n";
        break;
      case "r":
        result += "\r";
        break;
      case "t":
        result += "\t";
        break;
      case "\\":
        result += "\\";
        break;
      case "'":
        result += "'";
        break;
      default:
        result += escapedCharacter;
        break;
    }

    index += 1;
  }

  throw createError(resourcePath, "Unterminated pipe string literal.");
};

const readPipeArgument = (
  value: string,
  startIndex: number,
  resourcePath: string,
): { nextIndex: number; value: PipeArgument } => {
  const character = value[startIndex];

  if (character === "'") {
    const parsedString = parsePipeString(value, startIndex, resourcePath);
    let nextIndex = startIndex + 1;
    let escaping = false;

    while (nextIndex < value.length) {
      const currentCharacter = value[nextIndex];

      if (!escaping && currentCharacter === "'") {
        return {
          nextIndex: nextIndex + 1,
          value: parsedString,
        };
      }

      escaping = !escaping && currentCharacter === "\\";
      if (currentCharacter !== "\\") {
        escaping = false;
      }
      nextIndex += 1;
    }

    throw createError(resourcePath, "Unterminated pipe string literal.");
  }

  let nextIndex = startIndex;

  while (nextIndex < value.length && !",)".includes(value[nextIndex])) {
    nextIndex += 1;
  }

  const token = value.slice(startIndex, nextIndex).trim();

  if (token === "true") {
    return { nextIndex, value: true };
  }

  if (token === "false") {
    return { nextIndex, value: false };
  }

  if (NUMBER_PATTERN.test(token)) {
    return {
      nextIndex,
      value: Number(token),
    };
  }

  throw createError(resourcePath, `Invalid pipe argument "${token}".`);
};

const parsePipeExpression = (value: string, resourcePath: string): ParsedPipeExpression => {
  const openParenthesisIndex = value.indexOf("(");

  if (openParenthesisIndex === -1) {
    return {
      args: [],
      name: assertIdentifier(value, "pipe", resourcePath),
    };
  }

  if (!value.endsWith(")")) {
    throw createError(resourcePath, `Invalid pipe expression "${value}".`);
  }

  const name = assertIdentifier(value.slice(0, openParenthesisIndex), "pipe", resourcePath);
  const argsSource = value.slice(openParenthesisIndex + 1, -1);
  const args: PipeArgument[] = [];
  let index = 0;

  while (index < argsSource.length) {
    while (argsSource[index] === " ") {
      index += 1;
    }

    if (index >= argsSource.length) {
      break;
    }

    const parsedArgument = readPipeArgument(argsSource, index, resourcePath);
    args.push(parsedArgument.value);
    index = parsedArgument.nextIndex;

    while (argsSource[index] === " ") {
      index += 1;
    }

    if (index >= argsSource.length) {
      break;
    }

    if (argsSource[index] !== ",") {
      throw createError(resourcePath, `Invalid pipe expression "${value}".`);
    }

    index += 1;
  }

  return {
    args,
    name,
  };
};

const parsePlaceholder = (value: string, resourcePath: string): CompiledPlaceholder => {
  const separatorIndex = value.indexOf("|");
  const name = assertIdentifier(
    separatorIndex === -1 ? value : value.slice(0, separatorIndex),
    "parameter name",
    resourcePath,
  );

  if (separatorIndex === -1) {
    return {
      name,
      pipeArgs: [],
      pipeName: null,
    };
  }

  const pipeExpression = parsePipeExpression(value.slice(separatorIndex + 1), resourcePath);

  try {
    assertSupportedPromptPipe(pipeExpression.name, pipeExpression.args);
  } catch (error) {
    throw createPipeError(resourcePath, error);
  }

  return {
    name,
    pipeArgs: pipeExpression.args,
    pipeName: pipeExpression.name,
  };
};

const compileTemplateBody = (
  body: string,
  resourcePath: string,
): { compiledTemplate: CompiledTemplate; parameterNames: readonly string[] } => {
  const segments: string[] = [];
  const placeholders: CompiledPlaceholder[] = [];
  const parameterNames = new Set<string>();
  let cursor = 0;

  while (cursor < body.length) {
    const placeholderStartIndex = body.indexOf(PLACEHOLDER_PREFIX, cursor);

    if (placeholderStartIndex === -1) {
      break;
    }

    const placeholderEndIndex = body.indexOf(
      "]]",
      placeholderStartIndex + PLACEHOLDER_PREFIX.length,
    );

    if (placeholderEndIndex === -1) {
      throw createError(resourcePath, "Prompt template contains an unterminated placeholder.");
    }

    segments.push(body.slice(cursor, placeholderStartIndex));

    const placeholderSource = body.slice(
      placeholderStartIndex + PLACEHOLDER_PREFIX.length,
      placeholderEndIndex,
    );
    const placeholder = parsePlaceholder(placeholderSource, resourcePath);

    placeholders.push(placeholder);
    parameterNames.add(placeholder.name);
    cursor = placeholderEndIndex + 2;
  }

  segments.push(body.slice(cursor));

  return {
    compiledTemplate: {
      placeholders,
      segments,
    },
    parameterNames: [...parameterNames],
  };
};

const renderJavaScriptLiteral = (value: FrontmatterValue | CompiledTemplate): string => {
  return JSON.stringify(value, null, 2);
};

const renderTypeScriptLiteralType = (value: FrontmatterValue): string => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "readonly []";
    }

    return `readonly [${value.map((item) => renderTypeScriptLiteralType(item)).join(", ")}]`;
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    return "Record<never, never>";
  }

  return `{\n${entries
    .map(
      ([key, entryValue]) =>
        `  readonly ${renderTypeScriptPropertyKey(key)}: ${renderTypeScriptLiteralType(entryValue)};`,
    )
    .join("\n")}\n}`;
};

const renderArgsType = (parameterNames: readonly string[]): string => {
  if (parameterNames.length === 0) {
    return "Record<never, never>";
  }

  return `{\n${parameterNames
    .map((parameterName) => `  readonly ${renderTypeScriptPropertyKey(parameterName)}: unknown;`)
    .join("\n")}\n}`;
};

export const isPromptTemplatePath = (filePath: string): boolean => {
  return TEMPLATE_FILE_PATTERN.test(normalizePromptTemplatePath(filePath));
};

export const normalizePromptTemplatePath = (filePath: string): string => {
  return filePath.replace(TEMPLATE_QUERY_PATTERN, "");
};

export const getPromptTemplateDeclarationPath = (resourcePath: string): string => {
  const normalizedResourcePath = normalizePromptTemplatePath(resourcePath);

  if (!normalizedResourcePath.endsWith(".md")) {
    throw createError(resourcePath, "Prompt template declarations require a .md resource path.");
  }

  return normalizedResourcePath.replace(/\.md$/, ".d.md.ts");
};

export const compilePromptModule = (
  source: string,
  options: {
    resourcePath: string;
    runtimeModulePath: string;
  },
): CompiledPromptModule => {
  const { body, frontmatter } = extractFrontmatter(source);
  const { compiledTemplate, parameterNames } = compileTemplateBody(body, options.resourcePath);
  const runtimeImportPath = escapePathForImport(
    path.relative(path.dirname(options.resourcePath), options.runtimeModulePath),
  );
  const frontmatterType = renderTypeScriptLiteralType(frontmatter);
  const argsType = renderArgsType(parameterNames);
  const promptInputType = `Args | ((frontmatter: FrontMatter) => Args)`;
  const promptArgument =
    parameterNames.length === 0 ? `input?: ${promptInputType}` : `input: ${promptInputType}`;

  return {
    code: `import { createPromptRenderer } from ${JSON.stringify(runtimeImportPath)};

const compiledTemplate = ${renderJavaScriptLiteral(compiledTemplate)};
export const frontmatter = ${renderJavaScriptLiteral(frontmatter)};
export const prompt = createPromptRenderer(compiledTemplate, frontmatter);
`,
    dts: `// Generated by meow-prompt. Do not edit by hand.
export declare const frontmatter: ${frontmatterType};
export type FrontMatter = typeof frontmatter;
export type Args = ${argsType};
export declare const prompt: (${promptArgument}) => string;
`,
    frontmatter,
    parameterNames,
  };
};
