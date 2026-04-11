import { promises as fs } from "node:fs";
import path from "node:path";
import {
  normalizeConventionalTitleMetadata,
  type ConventionalTitleMetadata,
} from "@/lib/team/request-title";

const ROADMAP_ROOT_RELATIVE_PATH = path.join("docs", "roadmap");
const ROADMAP_SEGMENT_PATTERN = /^[a-z0-9-]+$/u;
const RELATED_SPECS_HEADING_PATTERN = /^##\s+Related Specs\s*$/u;

type RoadmapDocMatch = {
  slug: string;
  absolutePath: string;
  relativePath: string;
  aliases: string[];
};

export type ResolvedRoadmapTopic = {
  scope: string;
  roadmapSlug: string;
  roadmapPath: string;
  topicSlug: string;
  topicPath: string;
};

export type RoadmapArchiveUpdateResult = {
  updated: boolean;
  topicPath: string | null;
  linkedSpecs: string[];
};

const toPosixPath = (value: string): string => {
  return value.split(path.sep).join("/");
};

const normalizeRoadmapSegment = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return normalized && ROADMAP_SEGMENT_PATTERN.test(normalized) ? normalized : null;
};

const extractFrontmatterAliases = (markdown: string): string[] => {
  const lines = markdown.replace(/\r\n/gu, "\n").split("\n");

  if (lines[0]?.trim() !== "---") {
    return [];
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closingIndex < 0) {
    return [];
  }

  const frontmatterLines = lines.slice(1, closingIndex);
  const aliases: string[] = [];

  for (let index = 0; index < frontmatterLines.length; index += 1) {
    const line = frontmatterLines[index]!;
    const trimmedLine = line.trim();

    if (!trimmedLine.startsWith("aliases:")) {
      continue;
    }

    const inlineAliasesMatch = trimmedLine.match(/^aliases:\s*\[(.*)\]\s*$/u);
    if (inlineAliasesMatch) {
      aliases.push(
        ...inlineAliasesMatch[1]!
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      );
      continue;
    }

    for (let nestedIndex = index + 1; nestedIndex < frontmatterLines.length; nestedIndex += 1) {
      const nestedLine = frontmatterLines[nestedIndex]!;
      const aliasMatch = nestedLine.match(/^\s*-\s+(.+?)\s*$/u);

      if (!aliasMatch) {
        break;
      }

      aliases.push(aliasMatch[1]!);
      index = nestedIndex;
    }
  }

  return [
    ...new Set(
      aliases
        .map((entry) => normalizeRoadmapSegment(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  ];
};

const readMarkdownAliases = async (filePath: string): Promise<string[]> => {
  const source = await fs.readFile(filePath, "utf8");
  return extractFrontmatterAliases(source);
};

const collectRoadmapMatches = async ({
  entries,
  candidate,
}: {
  entries: RoadmapDocMatch[];
  candidate: string;
}): Promise<RoadmapDocMatch> => {
  const matches = entries.filter((entry) => {
    return entry.slug === candidate || entry.aliases.includes(candidate);
  });

  if (matches.length === 1) {
    return matches[0]!;
  }

  if (matches.length > 1) {
    throw new Error(
      `Roadmap alias "${candidate}" is ambiguous across ${matches
        .map((entry) => entry.relativePath)
        .join(", ")}.`,
    );
  }

  throw new Error(`Roadmap alias "${candidate}" did not match any document under docs/roadmap.`);
};

const readRoadmapEntries = async ({
  worktreePath,
  roadmapRootPath,
}: {
  worktreePath: string;
  roadmapRootPath: string;
}): Promise<RoadmapDocMatch[]> => {
  const roadmapIndexPath = path.join(roadmapRootPath, "index.md");

  try {
    await fs.stat(roadmapIndexPath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      throw new Error("Roadmap index docs/roadmap/index.md was not found.");
    }

    throw error;
  }

  const entries = await fs.readdir(roadmapRootPath, {
    encoding: "utf8",
    withFileTypes: true,
  });

  const roadmapEntries = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && ROADMAP_SEGMENT_PATTERN.test(entry.name))
      .map(async (entry) => {
        const absolutePath = path.join(roadmapRootPath, entry.name, "index.md");

        try {
          return {
            slug: entry.name,
            absolutePath: path.dirname(absolutePath),
            relativePath: toPosixPath(path.relative(worktreePath, absolutePath)),
            aliases: await readMarkdownAliases(absolutePath),
          } satisfies RoadmapDocMatch;
        } catch (error) {
          const nodeError = error as NodeJS.ErrnoException;
          if (nodeError.code === "ENOENT") {
            return null;
          }

          throw error;
        }
      }),
  );

  return roadmapEntries.filter((entry): entry is RoadmapDocMatch => Boolean(entry));
};

const readTopicEntries = async ({
  worktreePath,
  roadmapDirectoryPath,
}: {
  worktreePath: string;
  roadmapDirectoryPath: string;
}): Promise<RoadmapDocMatch[]> => {
  const entries = await fs.readdir(roadmapDirectoryPath, {
    encoding: "utf8",
    withFileTypes: true,
  });

  const topicEntries = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "index.md")
      .map(async (entry) => {
        const slug = entry.name.slice(0, -".md".length);
        if (!ROADMAP_SEGMENT_PATTERN.test(slug)) {
          return null;
        }

        const absolutePath = path.join(roadmapDirectoryPath, entry.name);

        return {
          slug,
          absolutePath,
          relativePath: toPosixPath(path.relative(worktreePath, absolutePath)),
          aliases: await readMarkdownAliases(absolutePath),
        } satisfies RoadmapDocMatch;
      }),
  );

  return topicEntries.filter((entry): entry is RoadmapDocMatch => Boolean(entry));
};

const listArchivedSpecFiles = async (directoryPath: string): Promise<string[]> => {
  const entries = await fs.readdir(directoryPath, {
    encoding: "utf8",
    withFileTypes: true,
  });

  const nestedEntries = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return listArchivedSpecFiles(absolutePath);
      }

      return entry.isFile() && entry.name === "spec.md" ? [absolutePath] : [];
    }),
  );

  return nestedEntries.flat().sort((left, right) => left.localeCompare(right));
};

const updateRelatedSpecsSection = ({
  topicContent,
  topicPath,
  linkLines,
}: {
  topicContent: string;
  topicPath: string;
  linkLines: string[];
}): {
  updated: boolean;
  nextContent: string;
} => {
  const normalizedTopicContent = topicContent.replace(/\r\n/gu, "\n");
  const lines = normalizedTopicContent.split("\n");
  const relatedSpecsHeadingIndex = lines.findIndex((line) => {
    return RELATED_SPECS_HEADING_PATTERN.test(line.trim());
  });

  if (relatedSpecsHeadingIndex < 0) {
    throw new Error(`Roadmap topic ${topicPath} is missing a ## Related Specs section.`);
  }

  const nextHeadingIndex = lines.findIndex((line, index) => {
    return index > relatedSpecsHeadingIndex && /^##\s+/u.test(line.trim());
  });
  const sectionEndIndex = nextHeadingIndex >= 0 ? nextHeadingIndex : lines.length;
  const sectionLines = lines.slice(relatedSpecsHeadingIndex + 1, sectionEndIndex);
  const existingLines = new Set(sectionLines.map((line) => line.trimEnd()));
  const nextLinkLines = linkLines.filter((line) => !existingLines.has(line));

  if (nextLinkLines.length === 0) {
    return {
      updated: false,
      nextContent: topicContent,
    };
  }

  const nextSectionLines =
    sectionLines.length === 0 || sectionLines.every((line) => !line.trim())
      ? ["", ...nextLinkLines]
      : [...sectionLines, ...nextLinkLines];

  const nextLines = [
    ...lines.slice(0, relatedSpecsHeadingIndex + 1),
    ...nextSectionLines,
    ...lines.slice(sectionEndIndex),
  ];
  const trailingNewline = normalizedTopicContent.endsWith("\n") ? "\n" : "";

  return {
    updated: true,
    nextContent: `${nextLines.join("\n")}${trailingNewline}`,
  };
};

export const resolveRoadmapTopicFromScope = async ({
  worktreePath,
  scope,
}: {
  worktreePath: string;
  scope: string;
}): Promise<ResolvedRoadmapTopic | null> => {
  const segments = scope
    .split("/")
    .map((segment) => normalizeRoadmapSegment(segment))
    .filter((segment): segment is string => Boolean(segment));

  if (segments.length !== 2) {
    return null;
  }

  const [roadmapSegment, topicSegment] = segments;
  const roadmapRootPath = path.join(worktreePath, ROADMAP_ROOT_RELATIVE_PATH);
  const roadmapMatch = await collectRoadmapMatches({
    entries: await readRoadmapEntries({
      worktreePath,
      roadmapRootPath,
    }),
    candidate: roadmapSegment,
  });
  const topicMatch = await collectRoadmapMatches({
    entries: await readTopicEntries({
      worktreePath,
      roadmapDirectoryPath: roadmapMatch.absolutePath,
    }),
    candidate: topicSegment,
  });

  return {
    scope: `${roadmapSegment}/${topicSegment}`,
    roadmapSlug: roadmapMatch.slug,
    roadmapPath: toPosixPath(
      path.relative(worktreePath, path.join(roadmapMatch.absolutePath, "index.md")),
    ),
    topicSlug: topicMatch.slug,
    topicPath: toPosixPath(path.relative(worktreePath, topicMatch.absolutePath)),
  };
};

export const appendArchivedOpenSpecLinksToRoadmapTopic = async ({
  worktreePath,
  changeName,
  archivedChangePath,
  conventionalTitle,
}: {
  worktreePath: string;
  changeName: string;
  archivedChangePath: string;
  conventionalTitle: ConventionalTitleMetadata | null | undefined;
}): Promise<RoadmapArchiveUpdateResult> => {
  const metadata = normalizeConventionalTitleMetadata(conventionalTitle);
  const scope = metadata?.scope ?? null;

  if (!scope) {
    return {
      updated: false,
      topicPath: null,
      linkedSpecs: [],
    };
  }

  const resolvedTopic = await resolveRoadmapTopicFromScope({
    worktreePath,
    scope,
  });

  if (!resolvedTopic) {
    return {
      updated: false,
      topicPath: null,
      linkedSpecs: [],
    };
  }

  const archivedSpecsRootPath = path.join(worktreePath, archivedChangePath, "specs");
  let archivedSpecFiles: string[];
  try {
    archivedSpecFiles = await listArchivedSpecFiles(archivedSpecsRootPath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      throw new Error(
        `Archived OpenSpec change ${changeName} is missing its specs directory at ${toPosixPath(
          path.relative(worktreePath, archivedSpecsRootPath),
        )}.`,
      );
    }

    throw error;
  }

  if (archivedSpecFiles.length === 0) {
    throw new Error(
      `Archived OpenSpec change ${changeName} does not contain any spec.md files under ${toPosixPath(
        path.relative(worktreePath, archivedSpecsRootPath),
      )}.`,
    );
  }

  const topicAbsolutePath = path.join(worktreePath, resolvedTopic.topicPath);
  const topicContent = await fs.readFile(topicAbsolutePath, "utf8");
  const linkLines = archivedSpecFiles.map((absoluteSpecPath) => {
    const capability = path.basename(path.dirname(absoluteSpecPath));
    const label =
      archivedSpecFiles.length === 1
        ? changeName
        : `${changeName} / ${normalizeRoadmapSegment(capability) ?? capability}`;
    const relativeSpecPath = toPosixPath(
      path.relative(path.dirname(topicAbsolutePath), absoluteSpecPath),
    );

    return `- [${label}](${relativeSpecPath})`;
  });
  const { updated, nextContent } = updateRelatedSpecsSection({
    topicContent,
    topicPath: resolvedTopic.topicPath,
    linkLines,
  });

  if (updated) {
    await fs.writeFile(topicAbsolutePath, nextContent, "utf8");
  }

  return {
    updated,
    topicPath: resolvedTopic.topicPath,
    linkedSpecs: archivedSpecFiles.map((absoluteSpecPath) => {
      return toPosixPath(path.relative(worktreePath, absoluteSpecPath));
    }),
  };
};
