type FrontmatterPrimitive = boolean | number | string | null;

export type FrontmatterValue =
  | FrontmatterPrimitive
  | { [key: string]: FrontmatterValue }
  | FrontmatterValue[];

type FrontmatterLine = {
  content: string;
  indent: number;
  lineNumber: number;
};

const SCALAR_NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

const parseQuotedString = (value: string): string => {
  if (value.length < 2) {
    return value;
  }

  const quote = value[0];
  if ((quote !== "'" && quote !== '"') || value[value.length - 1] !== quote) {
    return value;
  }

  let result = "";

  for (let index = 1; index < value.length - 1; index += 1) {
    const character = value[index];

    if (character !== "\\") {
      result += character;
      continue;
    }

    index += 1;

    const escapedCharacter = value[index];

    if (escapedCharacter === undefined) {
      throw new Error("Invalid frontmatter string escape.");
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
      case '"':
        result += '"';
        break;
      default:
        result += escapedCharacter;
        break;
    }
  }

  return result;
};

const parseScalarValue = (value: string): FrontmatterValue => {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (value === "null") {
    return null;
  }

  if (SCALAR_NUMBER_PATTERN.test(value)) {
    return Number(value);
  }

  return parseQuotedString(value);
};

const toFrontmatterLines = (rawFrontmatter: string): FrontmatterLine[] => {
  return rawFrontmatter
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => Boolean(line.trim()) && !line.trim().startsWith("#"))
    .map(({ line, lineNumber }) => {
      const indent = line.match(/^ */)?.[0].length ?? 0;

      if (indent % 2 !== 0) {
        throw new Error(`Frontmatter line ${lineNumber} must use two-space indentation.`);
      }

      return {
        content: line.trim(),
        indent,
        lineNumber,
      };
    });
};

const parseFrontmatterBlock = (
  lines: readonly FrontmatterLine[],
  startIndex: number,
  indent: number,
): { nextIndex: number; value: FrontmatterValue } => {
  const currentLine = lines[startIndex];

  if (!currentLine || currentLine.indent < indent) {
    return {
      nextIndex: startIndex,
      value: {},
    };
  }

  if (currentLine.indent > indent) {
    throw new Error(
      `Unexpected frontmatter indentation on line ${currentLine.lineNumber}; expected ${indent} spaces.`,
    );
  }

  if (currentLine.content.startsWith("- ")) {
    const value: FrontmatterValue[] = [];
    let nextIndex = startIndex;

    while (nextIndex < lines.length) {
      const line = lines[nextIndex];

      if (line.indent < indent) {
        break;
      }

      if (line.indent > indent) {
        throw new Error(
          `Unexpected frontmatter indentation on line ${line.lineNumber}; expected ${indent} spaces.`,
        );
      }

      if (!line.content.startsWith("- ")) {
        break;
      }

      const inlineValue = line.content.slice(2).trim();
      nextIndex += 1;

      if (inlineValue.length > 0) {
        value.push(parseScalarValue(inlineValue));
        continue;
      }

      const nestedBlock = parseFrontmatterBlock(lines, nextIndex, indent + 2);
      value.push(nestedBlock.value);
      nextIndex = nestedBlock.nextIndex;
    }

    return { nextIndex, value };
  }

  const value: Record<string, FrontmatterValue> = {};
  let nextIndex = startIndex;

  while (nextIndex < lines.length) {
    const line = lines[nextIndex];

    if (line.indent < indent) {
      break;
    }

    if (line.indent > indent) {
      throw new Error(
        `Unexpected frontmatter indentation on line ${line.lineNumber}; expected ${indent} spaces.`,
      );
    }

    if (line.content.startsWith("- ")) {
      break;
    }

    const separatorIndex = line.content.indexOf(":");

    if (separatorIndex <= 0) {
      throw new Error(`Invalid frontmatter entry on line ${line.lineNumber}.`);
    }

    const key = line.content.slice(0, separatorIndex).trim();
    const inlineValue = line.content.slice(separatorIndex + 1).trim();
    nextIndex += 1;

    if (inlineValue.length > 0) {
      value[key] = parseScalarValue(inlineValue);
      continue;
    }

    if (nextIndex >= lines.length || lines[nextIndex].indent <= indent) {
      value[key] = null;
      continue;
    }

    const nestedBlock = parseFrontmatterBlock(lines, nextIndex, indent + 2);
    value[key] = nestedBlock.value;
    nextIndex = nestedBlock.nextIndex;
  }

  return { nextIndex, value };
};

export const parseFrontmatter = (rawFrontmatter: string): Record<string, FrontmatterValue> => {
  const lines = toFrontmatterLines(rawFrontmatter);

  if (lines.length === 0) {
    return {};
  }

  const { nextIndex, value } = parseFrontmatterBlock(lines, 0, 0);

  if (nextIndex !== lines.length || !value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Prompt frontmatter must be a top-level mapping.");
  }

  return value;
};

export const extractFrontmatter = (
  source: string,
): { body: string; frontmatter: Record<string, FrontmatterValue> } => {
  const normalizedSource = source.replace(/\r\n/g, "\n");

  if (!normalizedSource.startsWith("---\n")) {
    return {
      body: normalizedSource,
      frontmatter: {},
    };
  }

  const lines = normalizedSource.split("\n");
  const closingMarkerIndex = lines.findIndex((line, index) => index > 0 && line === "---");

  if (closingMarkerIndex === -1) {
    throw new Error("Prompt frontmatter is missing a closing --- delimiter.");
  }

  const rawFrontmatter = lines.slice(1, closingMarkerIndex).join("\n");
  const body = lines.slice(closingMarkerIndex + 1).join("\n");

  return {
    body: body.startsWith("\n") ? body.slice(1) : body,
    frontmatter: parseFrontmatter(rawFrontmatter),
  };
};
