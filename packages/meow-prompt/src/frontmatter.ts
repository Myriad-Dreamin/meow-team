import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

type LoadYaml = (source: string, options?: { schema?: unknown }) => unknown;
type ParseYaml = (source: string) => unknown;
type YamlModule = {
  load: LoadYaml;
  JSON_SCHEMA: unknown;
};

let parseYaml: ParseYaml | null = null;
let yamlModule: YamlModule | null = null;

const currentFilePath = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(currentFilePath), "..");
const workspaceRoot = path.resolve(packageRoot, "..", "..");

const getJsYamlRequireBasePaths = (): string[] => {
  const candidatePaths = [path.join(packageRoot, "package.json")];
  const workspaceNodeModulesPath = path.join(workspaceRoot, "node_modules");

  if (existsSync(workspaceNodeModulesPath)) {
    const resolvedWorkspaceRoot = path.dirname(realpathSync(workspaceNodeModulesPath));
    const resolvedPackageJsonPath = path.join(
      resolvedWorkspaceRoot,
      "packages",
      "meow-prompt",
      "package.json",
    );

    if (existsSync(resolvedPackageJsonPath)) {
      candidatePaths.push(resolvedPackageJsonPath);
    }
  }

  return [...new Set(candidatePaths)];
};

const getYamlModule = (): YamlModule => {
  if (yamlModule) {
    return yamlModule;
  }

  let lastError: unknown = null;

  for (const requireBasePath of getJsYamlRequireBasePaths()) {
    try {
      yamlModule = createRequire(requireBasePath)("js-yaml") as YamlModule;
      return yamlModule;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to resolve js-yaml.");
};

const getParseYaml = (): ParseYaml => {
  if (parseYaml) {
    return parseYaml;
  }

  const { load, JSON_SCHEMA } = getYamlModule();
  parseYaml = (source) => load(source, { schema: JSON_SCHEMA });
  return parseYaml;
};

type FrontmatterPrimitive = boolean | number | string | null;

export type FrontmatterValue =
  | FrontmatterPrimitive
  | { [key: string]: FrontmatterValue }
  | FrontmatterValue[];

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const normalizeFrontmatterValue = (value: unknown, path = "frontmatter"): FrontmatterValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Unsupported frontmatter number at ${path}.`);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeFrontmatterValue(entry, `${path}[${index}]`));
  }

  if (isPlainObject(value)) {
    const normalizedValue: Record<string, FrontmatterValue> = {};

    for (const [key, entryValue] of Object.entries(value)) {
      normalizedValue[key] = normalizeFrontmatterValue(entryValue, `${path}.${key}`);
    }

    return normalizedValue;
  }

  throw new Error(`Unsupported frontmatter value at ${path}.`);
};

export const stripYamlFrontmatter = (
  markdown: string,
): { frontmatter: string | null; body: string } => {
  if (!markdown.startsWith("---")) {
    return { frontmatter: null, body: markdown };
  }

  const lines = markdown.split(/\r?\n/);

  if (lines[0].trim() !== "---") {
    return { frontmatter: null, body: markdown };
  }

  let end = -1;

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      end = index;
      break;
    }
  }

  if (end === -1) {
    return { frontmatter: null, body: markdown };
  }

  const frontmatter = lines.slice(1, end).join("\n");
  const body = lines.slice(end + 1).join("\n");

  return { frontmatter, body };
};

export const parseFrontmatter = (rawFrontmatter: string): Record<string, FrontmatterValue> => {
  if (!rawFrontmatter.trim()) {
    return {};
  }

  const parsedFrontmatter = getParseYaml()(rawFrontmatter);

  if (parsedFrontmatter === undefined || parsedFrontmatter === null) {
    return {};
  }

  const normalizedFrontmatter = normalizeFrontmatterValue(parsedFrontmatter);

  if (
    !normalizedFrontmatter ||
    Array.isArray(normalizedFrontmatter) ||
    typeof normalizedFrontmatter !== "object"
  ) {
    throw new Error("Prompt frontmatter must be a top-level mapping.");
  }

  return normalizedFrontmatter;
};

export const extractFrontmatter = (
  source: string,
): { body: string; frontmatter: Record<string, FrontmatterValue> } => {
  const { body, frontmatter } = stripYamlFrontmatter(source);

  if (frontmatter === null) {
    return {
      body,
      frontmatter: {},
    };
  }

  return {
    body,
    frontmatter: parseFrontmatter(frontmatter),
  };
};
