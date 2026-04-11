import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const resolveJsYamlPackageJsonPath = (): string => {
  const directPackagePath = path.join(process.cwd(), "node_modules", "js-yaml", "package.json");

  if (fs.existsSync(directPackagePath)) {
    return directPackagePath;
  }

  const pnpmStoreDirectory = path.join(process.cwd(), "node_modules", ".pnpm");

  if (!fs.existsSync(pnpmStoreDirectory)) {
    throw new Error("Unable to resolve js-yaml from node_modules.");
  }

  const jsYamlEntry = fs
    .readdirSync(pnpmStoreDirectory)
    .sort()
    .find((entry) => entry.startsWith("js-yaml@"));

  if (!jsYamlEntry) {
    throw new Error("Unable to resolve js-yaml from node_modules.");
  }

  return path.join(pnpmStoreDirectory, jsYamlEntry, "node_modules", "js-yaml", "package.json");
};

const { load: loadYaml } = createRequire(resolveJsYamlPackageJsonPath())("js-yaml") as {
  load: (source: string) => unknown;
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

  const parsedFrontmatter = loadYaml(rawFrontmatter);

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
