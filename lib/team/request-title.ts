const DEFAULT_REQUEST_TITLE = "Untitled Request";
const MAX_REQUEST_TITLE_LENGTH = 80;

export const CONVENTIONAL_TITLE_TYPES = [
  "dev",
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
] as const;

export type ConventionalTitleType = (typeof CONVENTIONAL_TITLE_TYPES)[number];

export type ConventionalTitleMetadata = {
  type: ConventionalTitleType;
  scope: string | null;
};

export const CONVENTIONAL_TITLE_SCOPE_PATTERN = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u;

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/gu, " ").trim();
};

const trimTitlePunctuation = (value: string): string => {
  return value.replace(/^[`"'#*:_\-\s]+|[`"'#*:_\-\s.?!,;]+$/gu, "").trim();
};

const trimConventionalSubjectPunctuation = (value: string): string => {
  if (/^`[^`]+`/u.test(value)) {
    return value.replace(/["'#*:_\-\s.?!,;]+$/gu, "").trim();
  }

  return trimTitlePunctuation(value);
};

const shortenTitle = (value: string, maxLength = MAX_REQUEST_TITLE_LENGTH): string => {
  if (value.length <= maxLength) {
    return value;
  }

  const shortened = value.slice(0, maxLength).trim();
  const lastSpace = shortened.lastIndexOf(" ");

  if (lastSpace < 24) {
    return shortened;
  }

  return shortened.slice(0, lastSpace).trim();
};

const normalizeConventionalTitleType = (
  value: string | null | undefined,
): ConventionalTitleType | null => {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return CONVENTIONAL_TITLE_TYPES.includes(normalized as ConventionalTitleType)
    ? (normalized as ConventionalTitleType)
    : null;
};

const normalizeConventionalTitleScope = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/gu, "/")
    .replace(/[^a-z0-9/-]+/gu, "-")
    .replace(/\/+/gu, "/")
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/^\/+|\/+$/gu, "");

  return normalized && CONVENTIONAL_TITLE_SCOPE_PATTERN.test(normalized) ? normalized : null;
};

const buildConventionalTitlePrefix = (metadata: ConventionalTitleMetadata): string => {
  return metadata.scope ? `${metadata.type}(${metadata.scope}): ` : `${metadata.type}: `;
};

const normalizeConventionalSubject = (value: string | null | undefined): string => {
  if (!value) {
    return DEFAULT_REQUEST_TITLE;
  }

  const normalized = normalizeWhitespace(
    value.replace(/^(request\s+title|title)\s*:\s*/iu, "").replace(/[\r\n]+/gu, " "),
  );
  const shortened = shortenTitle(normalized);
  const trimmed = trimConventionalSubjectPunctuation(shortened);

  return trimmed || DEFAULT_REQUEST_TITLE;
};

export const normalizeRequestTitle = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(
    value.replace(/^(request\s+title|title)\s*:\s*/iu, "").replace(/[\r\n]+/gu, " "),
  );
  const trimmed = trimTitlePunctuation(shortenTitle(normalized));

  return trimmed || null;
};

export const normalizeConventionalTitleMetadata = (
  value:
    | ConventionalTitleMetadata
    | {
        type?: string | null;
        scope?: string | null;
      }
    | null
    | undefined,
): ConventionalTitleMetadata | null => {
  const type = normalizeConventionalTitleType(value?.type);

  if (!type) {
    return null;
  }

  return {
    type,
    scope: normalizeConventionalTitleScope(value?.scope),
  };
};

export const describeConventionalTitleMetadata = (
  value: ConventionalTitleMetadata | null | undefined,
): string => {
  const metadata = normalizeConventionalTitleMetadata(value);

  if (!metadata) {
    return "none";
  }

  return metadata.scope ? `${metadata.type}(${metadata.scope})` : metadata.type;
};

export const parseConventionalTitle = (
  value: string | null | undefined,
): {
  metadata: ConventionalTitleMetadata;
  subject: string;
} | null => {
  const normalized = normalizeRequestTitle(value);

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^([a-z]+)(?:\(([a-z0-9/-]+)\))?:\s+(.+)$/iu);
  if (!match) {
    return null;
  }

  const metadata = normalizeConventionalTitleMetadata({
    type: match[1],
    scope: match[2] ?? null,
  });
  const subject = normalizeRequestTitle(match[3]);

  if (!metadata || !subject) {
    return null;
  }

  return {
    metadata,
    subject,
  };
};

export const resolveRequestTitleSubject = (value: string | null | undefined): string | null => {
  const parsed = parseConventionalTitle(value);
  return parsed?.subject ?? normalizeRequestTitle(value);
};

export const formatConventionalTitle = ({
  metadata,
  subject,
}: {
  metadata: ConventionalTitleMetadata;
  subject: string | null | undefined;
}): string => {
  const prefix = buildConventionalTitlePrefix(metadata);
  const normalizedSubject = normalizeConventionalSubject(subject);
  const availableSubjectLength = Math.max(MAX_REQUEST_TITLE_LENGTH - prefix.length, 1);
  const shortenedSubject = shortenTitle(normalizedSubject, availableSubjectLength);
  const trimmedSubject =
    trimConventionalSubjectPunctuation(shortenedSubject) || DEFAULT_REQUEST_TITLE;

  return `${prefix}${trimmedSubject}`;
};

const resolveTaskAwareTitleSubject = ({
  requestTitle,
  taskTitle,
  taskCount = 1,
  preferTaskTitle,
}: {
  requestTitle: string | null | undefined;
  taskTitle: string | null | undefined;
  taskCount?: number;
  preferTaskTitle: boolean;
}): string => {
  const requestSubject = resolveRequestTitleSubject(requestTitle);
  const taskSubject = resolveRequestTitleSubject(taskTitle);

  if (taskCount === 1) {
    return (
      (preferTaskTitle ? taskSubject : requestSubject) ??
      requestSubject ??
      taskSubject ??
      DEFAULT_REQUEST_TITLE
    );
  }

  return (
    (preferTaskTitle ? requestSubject : taskSubject) ??
    taskSubject ??
    requestSubject ??
    DEFAULT_REQUEST_TITLE
  );
};

export const buildCanonicalRequestTitle = ({
  requestTitle,
  taskTitle,
  taskCount = 1,
  conventionalTitle,
}: {
  requestTitle: string | null | undefined;
  taskTitle: string | null | undefined;
  taskCount?: number;
  conventionalTitle: ConventionalTitleMetadata | null | undefined;
}): string => {
  const metadata = normalizeConventionalTitleMetadata(conventionalTitle);
  const subject = resolveTaskAwareTitleSubject({
    requestTitle,
    taskTitle,
    taskCount,
    preferTaskTitle: !(taskCount === 1 && metadata && resolveRequestTitleSubject(requestTitle)),
  });

  return metadata
    ? formatConventionalTitle({
        metadata,
        subject,
      })
    : subject;
};

export const buildLanePullRequestTitle = ({
  requestTitle,
  taskTitle,
  taskCount = 1,
  conventionalTitle,
}: {
  requestTitle: string | null | undefined;
  taskTitle: string | null | undefined;
  taskCount?: number;
  conventionalTitle: ConventionalTitleMetadata | null | undefined;
}): string => {
  const metadata = normalizeConventionalTitleMetadata(conventionalTitle);
  const subject = resolveTaskAwareTitleSubject({
    requestTitle,
    taskTitle,
    taskCount,
    preferTaskTitle: false,
  });

  return metadata ? formatConventionalTitle({ metadata, subject }) : subject;
};

export const buildDeterministicRequestTitle = (input: string | null | undefined): string => {
  const normalized = normalizeWhitespace(
    (input ?? "").replace(/[\r\n]+/gu, " ").replace(/[`*_>#]/gu, ""),
  );

  if (!normalized) {
    return DEFAULT_REQUEST_TITLE;
  }

  const firstSentence = normalized.split(/(?<=[.!?])\s+/u)[0] ?? normalized;
  const shortened = shortenTitle(firstSentence);
  const trimmed = trimTitlePunctuation(shortened);

  return trimmed || DEFAULT_REQUEST_TITLE;
};

export const resolveDisplayRequestTitle = ({
  requestTitle,
  requestText,
}: {
  requestTitle: string | null | undefined;
  requestText: string | null | undefined;
}): string => {
  return normalizeRequestTitle(requestTitle) ?? buildDeterministicRequestTitle(requestText);
};
