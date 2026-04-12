import { promises as fs } from "node:fs";
import path from "node:path";
import {
  normalizeConventionalTitleMetadata,
  type ConventionalTitleMetadata,
} from "@/lib/team/request-title";

const ROADMAP_ROOT_RELATIVE_PATH = path.join("docs", "roadmap");
const ROADMAP_SEGMENT_PATTERN = /^[a-z0-9-]+$/u;
const RELATED_SPECS_HEADING_PATTERN = /^##\s+Related Specs\s*$/u;
const ROADMAP_AVAILABLE_HEADING_PATTERN = /^##\s+Available Roadmaps\s*$/u;
const ROADMAP_TOPICS_HEADING_PATTERN = /^##\s+Topics\s*$/u;
const TODO_ITEMS_HEADING_PATTERN = /^##\s+Items\s*$/u;
const ROOT_TODO_RELATIVE_PATH = "TODO.md";
const DEFAULT_TODO_CONTENT = `---
name: TODO list of harness workflow
description: Each item in this list should be actionable and ideally linked to a specific code change or issue. Each item must describe the scope like "X component in Y folder" to make it clear which part of the codebase it relates to. It MUST not only restrict scope by file path because the files may be changed or moved, but also by component or functionality.
license: Apache-2.0
---
`;

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

const titleFromSlug = (value: string): string => {
  return value
    .split("-")
    .filter(Boolean)
    .map((segment) => {
      return segment.slice(0, 1).toUpperCase() + segment.slice(1);
    })
    .join(" ");
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

const findUniqueDocMatch = ({
  entries,
  candidate,
  kind,
}: {
  entries: RoadmapDocMatch[];
  candidate: string;
  kind: "Roadmap" | "Roadmap topic";
}): RoadmapDocMatch | null => {
  const matches = entries.filter((entry) => {
    return entry.slug === candidate || entry.aliases.includes(candidate);
  });

  if (matches.length === 1) {
    return matches[0]!;
  }

  if (matches.length > 1) {
    throw new Error(
      `${kind} alias "${candidate}" is ambiguous across ${matches
        .map((entry) => entry.relativePath)
        .join(", ")}.`,
    );
  }

  return null;
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

const appendUniqueLinesToSection = ({
  markdown,
  headingPattern,
  heading,
  linesToAppend,
}: {
  markdown: string;
  headingPattern: RegExp;
  heading: string;
  linesToAppend: string[];
}): {
  updated: boolean;
  nextContent: string;
} => {
  const normalizedMarkdown = markdown.replace(/\r\n/gu, "\n");
  const existingDocumentLines = new Set(
    normalizedMarkdown.split("\n").map((line) => line.trimEnd()),
  );
  const uniqueLinesToAppend = linesToAppend.filter((line) => !existingDocumentLines.has(line));

  if (uniqueLinesToAppend.length === 0) {
    return {
      updated: false,
      nextContent: markdown,
    };
  }

  const lines = normalizedMarkdown.split("\n");
  const headingIndex = lines.findIndex((line) => headingPattern.test(line.trim()));

  if (headingIndex < 0) {
    const trimmedContent = normalizedMarkdown.replace(/\s*$/u, "");
    const nextContent = trimmedContent
      ? `${trimmedContent}\n\n${heading}\n\n${uniqueLinesToAppend.join("\n")}\n`
      : `${heading}\n\n${uniqueLinesToAppend.join("\n")}\n`;

    return {
      updated: true,
      nextContent,
    };
  }

  const nextHeadingIndex = lines.findIndex((line, index) => {
    return index > headingIndex && /^##\s+/u.test(line.trim());
  });
  const sectionEndIndex = nextHeadingIndex >= 0 ? nextHeadingIndex : lines.length;
  const sectionLines = lines.slice(headingIndex + 1, sectionEndIndex);
  const existingSectionLines = new Set(sectionLines.map((line) => line.trimEnd()));
  const nextSectionLinesToAppend = uniqueLinesToAppend.filter(
    (line) => !existingSectionLines.has(line),
  );

  if (nextSectionLinesToAppend.length === 0) {
    return {
      updated: false,
      nextContent: markdown,
    };
  }

  const nextSectionLines =
    sectionLines.length === 0 || sectionLines.every((line) => !line.trim())
      ? ["", ...nextSectionLinesToAppend]
      : [...sectionLines, ...nextSectionLinesToAppend];

  const nextLines = [
    ...lines.slice(0, headingIndex + 1),
    ...nextSectionLines,
    ...lines.slice(sectionEndIndex),
  ];

  return {
    updated: true,
    nextContent: `${nextLines.join("\n").replace(/\s*$/u, "")}\n`,
  };
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

const writeFileIfMissing = async ({
  filePath,
  content,
}: {
  filePath: string;
  content: string;
}): Promise<boolean> => {
  try {
    await fs.stat(filePath);
    return false;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") {
      throw error;
    }
  }

  await fs.mkdir(path.dirname(filePath), {
    recursive: true,
  });
  await fs.writeFile(filePath, content, "utf8");

  return true;
};

const updateMarkdownSectionFile = async ({
  filePath,
  defaultContent,
  headingPattern,
  heading,
  linesToAppend,
}: {
  filePath: string;
  defaultContent: string;
  headingPattern: RegExp;
  heading: string;
  linesToAppend: string[];
}): Promise<boolean> => {
  let currentContent = defaultContent;

  try {
    currentContent = await fs.readFile(filePath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") {
      throw error;
    }

    await fs.mkdir(path.dirname(filePath), {
      recursive: true,
    });
  }

  const { updated, nextContent } = appendUniqueLinesToSection({
    markdown: currentContent,
    headingPattern,
    heading,
    linesToAppend,
  });

  if (!updated) {
    return false;
  }

  await fs.writeFile(filePath, nextContent, "utf8");
  return true;
};

const buildResolvedRoadmapTopic = ({
  worktreePath,
  scope,
  roadmapSlug,
  roadmapDirectoryPath,
  topicSlug,
}: {
  worktreePath: string;
  scope: string;
  roadmapSlug: string;
  roadmapDirectoryPath: string;
  topicSlug: string;
}): ResolvedRoadmapTopic => {
  return {
    scope,
    roadmapSlug,
    roadmapPath: toPosixPath(
      path.relative(worktreePath, path.join(roadmapDirectoryPath, "index.md")),
    ),
    topicSlug,
    topicPath: toPosixPath(
      path.relative(worktreePath, path.join(roadmapDirectoryPath, `${topicSlug}.md`)),
    ),
  };
};

const buildRoadmapDirectoryPath = ({
  worktreePath,
  roadmapSlug,
}: {
  worktreePath: string;
  roadmapSlug: string;
}): string => {
  return path.join(worktreePath, ROADMAP_ROOT_RELATIVE_PATH, roadmapSlug);
};

const buildRoadmapIndexContent = ({
  roadmapSlug,
  topicSlug,
}: {
  roadmapSlug: string;
  topicSlug: string;
}): string => {
  const roadmapTitle = titleFromSlug(roadmapSlug);
  const topicTitle = titleFromSlug(topicSlug);

  return `---
title: ${roadmapTitle}
outline: deep
---

# ${roadmapTitle}

This roadmap was created automatically during archive finalization because the \`${roadmapSlug}\` roadmap did not exist yet. Replace this placeholder with the longer-running goals, philosophy, and topic relationships for this area.

## Design Notes

- Document how the roadmap topics fit together.
- Replace this placeholder once the roadmap is curated.

## Topics

- [${topicTitle}](/roadmap/${roadmapSlug}/${topicSlug})
`;
};

const buildTopicContent = ({
  roadmapSlug,
  topicSlug,
}: {
  roadmapSlug: string;
  topicSlug: string;
}): string => {
  const topicTitle = titleFromSlug(topicSlug);

  return `---
title: ${topicTitle}
outline: deep
---

# ${topicTitle}

This topic was created automatically during archive finalization because the \`${roadmapSlug}/${topicSlug}\` roadmap scope did not exist yet. Replace this placeholder with concrete feature or task sections for the area.

## Planned Work

Document the feature or task themes that belong under this topic.

## Related Specs
`;
};

const buildRoadmapListEntry = (roadmapSlug: string): string => {
  return `- [${titleFromSlug(roadmapSlug)}](/roadmap/${roadmapSlug}/)`;
};

const buildTopicListEntry = ({
  roadmapSlug,
  topicSlug,
}: {
  roadmapSlug: string;
  topicSlug: string;
}): string => {
  return `- [${titleFromSlug(topicSlug)}](/roadmap/${roadmapSlug}/${topicSlug})`;
};

const buildRoadmapTodoItem = ({
  roadmapSlug,
  topicSlug,
  roadmapWasMissing,
  topicWasMissing,
}: {
  roadmapSlug: string;
  topicSlug: string;
  roadmapWasMissing: boolean;
  topicWasMissing: boolean;
}): string | null => {
  const roadmapPath = `docs/roadmap/${roadmapSlug}/index.md`;
  const topicPath = `docs/roadmap/${roadmapSlug}/${topicSlug}.md`;
  const canonicalScope = `${roadmapSlug}/${topicSlug}`;

  if (roadmapWasMissing) {
    return `- Expand the auto-created [${titleFromSlug(roadmapSlug)} roadmap](${roadmapPath}) and [${titleFromSlug(topicSlug)} topic](${topicPath}) for the \`${canonicalScope}\` archive-finalization scope.`;
  }

  if (topicWasMissing) {
    return `- Expand the auto-created [${titleFromSlug(topicSlug)} topic](${topicPath}) under the [${titleFromSlug(roadmapSlug)} roadmap](${roadmapPath}) for the \`${canonicalScope}\` archive-finalization scope.`;
  }

  return null;
};

const normalizeRoadmapScope = (scope: string): [string, string] | null => {
  const segments = scope
    .split("/")
    .map((segment) => normalizeRoadmapSegment(segment))
    .filter((segment): segment is string => Boolean(segment));

  return segments.length === 2 ? [segments[0]!, segments[1]!] : null;
};

const resolveRoadmapTopicStrict = async ({
  worktreePath,
  scope,
}: {
  worktreePath: string;
  scope: string;
}): Promise<ResolvedRoadmapTopic | null> => {
  const segments = normalizeRoadmapScope(scope);

  if (!segments) {
    return null;
  }

  const [roadmapSegment, topicSegment] = segments;
  const normalizedScope = `${roadmapSegment}/${topicSegment}`;
  const roadmapRootPath = path.join(worktreePath, ROADMAP_ROOT_RELATIVE_PATH);
  const roadmapEntries = await readRoadmapEntries({
    worktreePath,
    roadmapRootPath,
  });
  const roadmapMatch = findUniqueDocMatch({
    entries: roadmapEntries,
    candidate: roadmapSegment,
    kind: "Roadmap",
  });

  if (!roadmapMatch) {
    throw new Error(
      `Roadmap alias "${roadmapSegment}" did not match any document under ${toPosixPath(
        ROADMAP_ROOT_RELATIVE_PATH,
      )}.`,
    );
  }

  const topicEntries = await readTopicEntries({
    worktreePath,
    roadmapDirectoryPath: roadmapMatch.absolutePath,
  });
  const topicMatch = findUniqueDocMatch({
    entries: topicEntries,
    candidate: topicSegment,
    kind: "Roadmap topic",
  });

  if (!topicMatch) {
    throw new Error(
      `Roadmap topic alias "${topicSegment}" did not match any document under ${toPosixPath(
        path.relative(worktreePath, roadmapMatch.absolutePath),
      )}.`,
    );
  }

  return buildResolvedRoadmapTopic({
    worktreePath,
    scope: normalizedScope,
    roadmapSlug: roadmapMatch.slug,
    roadmapDirectoryPath: roadmapMatch.absolutePath,
    topicSlug: topicMatch.slug,
  });
};

const ensureRoadmapTopicFromScope = async ({
  worktreePath,
  scope,
}: {
  worktreePath: string;
  scope: string;
}): Promise<{
  resolvedTopic: ResolvedRoadmapTopic | null;
  updated: boolean;
}> => {
  const segments = normalizeRoadmapScope(scope);

  if (!segments) {
    return {
      resolvedTopic: null,
      updated: false,
    };
  }

  const [roadmapSegment, topicSegment] = segments;
  const normalizedScope = `${roadmapSegment}/${topicSegment}`;
  const roadmapRootPath = path.join(worktreePath, ROADMAP_ROOT_RELATIVE_PATH);
  const roadmapEntries = await readRoadmapEntries({
    worktreePath,
    roadmapRootPath,
  });
  const roadmapMatch = findUniqueDocMatch({
    entries: roadmapEntries,
    candidate: roadmapSegment,
    kind: "Roadmap",
  });

  let updated = false;
  let topicWasMissing = false;
  const roadmapWasMissing = !roadmapMatch;
  const resolvedRoadmapSlug = roadmapMatch?.slug ?? roadmapSegment;
  const roadmapDirectoryPath = roadmapMatch?.absolutePath
    ? roadmapMatch.absolutePath
    : buildRoadmapDirectoryPath({
        worktreePath,
        roadmapSlug: resolvedRoadmapSlug,
      });
  const roadmapIndexPath = path.join(roadmapDirectoryPath, "index.md");
  const topicPath = path.join(roadmapDirectoryPath, `${topicSegment}.md`);

  if (roadmapWasMissing) {
    updated =
      (await writeFileIfMissing({
        filePath: roadmapIndexPath,
        content: buildRoadmapIndexContent({
          roadmapSlug: resolvedRoadmapSlug,
          topicSlug: topicSegment,
        }),
      })) || updated;
    updated =
      (await updateMarkdownSectionFile({
        filePath: path.join(roadmapRootPath, "index.md"),
        defaultContent: "# Roadmaps\n",
        headingPattern: ROADMAP_AVAILABLE_HEADING_PATTERN,
        heading: "## Available Roadmaps",
        linesToAppend: [buildRoadmapListEntry(resolvedRoadmapSlug)],
      })) || updated;
  }

  const topicEntries = await readTopicEntries({
    worktreePath,
    roadmapDirectoryPath,
  });
  const topicMatch = findUniqueDocMatch({
    entries: topicEntries,
    candidate: topicSegment,
    kind: "Roadmap topic",
  });
  topicWasMissing = !topicMatch;

  if (topicWasMissing) {
    updated =
      (await writeFileIfMissing({
        filePath: topicPath,
        content: buildTopicContent({
          roadmapSlug: resolvedRoadmapSlug,
          topicSlug: topicSegment,
        }),
      })) || updated;
    updated =
      (await updateMarkdownSectionFile({
        filePath: roadmapIndexPath,
        defaultContent: buildRoadmapIndexContent({
          roadmapSlug: resolvedRoadmapSlug,
          topicSlug: topicSegment,
        }),
        headingPattern: ROADMAP_TOPICS_HEADING_PATTERN,
        heading: "## Topics",
        linesToAppend: [
          buildTopicListEntry({
            roadmapSlug: resolvedRoadmapSlug,
            topicSlug: topicSegment,
          }),
        ],
      })) || updated;
  }

  const todoLine = buildRoadmapTodoItem({
    roadmapSlug: resolvedRoadmapSlug,
    topicSlug: topicSegment,
    roadmapWasMissing,
    topicWasMissing,
  });

  if (todoLine) {
    updated =
      (await updateMarkdownSectionFile({
        filePath: path.join(worktreePath, ROOT_TODO_RELATIVE_PATH),
        defaultContent: DEFAULT_TODO_CONTENT,
        headingPattern: TODO_ITEMS_HEADING_PATTERN,
        heading: "## Items",
        linesToAppend: [todoLine],
      })) || updated;
  }

  return {
    resolvedTopic: buildResolvedRoadmapTopic({
      worktreePath,
      scope: normalizedScope,
      roadmapSlug: resolvedRoadmapSlug,
      roadmapDirectoryPath,
      topicSlug: topicMatch?.slug ?? topicSegment,
    }),
    updated,
  };
};

export const resolveRoadmapTopicFromScope = async ({
  worktreePath,
  scope,
}: {
  worktreePath: string;
  scope: string;
}): Promise<ResolvedRoadmapTopic | null> => {
  return resolveRoadmapTopicStrict({
    worktreePath,
    scope,
  });
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

  const { resolvedTopic, updated: scaffoldUpdated } = await ensureRoadmapTopicFromScope({
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
    updated: scaffoldUpdated || updated,
    topicPath: resolvedTopic.topicPath,
    linkedSpecs: archivedSpecFiles.map((absoluteSpecPath) => {
      return toPosixPath(path.relative(worktreePath, absoluteSpecPath));
    }),
  };
};
