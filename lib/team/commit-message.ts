import {
  normalizeRequestTitle,
  resolveRequestTitleSubject,
  type ConventionalTitleMetadata,
  type ConventionalTitleType,
} from "@/lib/team/request-title";

export const HARNESS_COMMIT_TYPES = ["dev", "docs", "fix", "test"] as const;

export type HarnessCommitType = (typeof HARNESS_COMMIT_TYPES)[number];

export type HarnessCommitIntent = "implementation" | "proposal" | "archive" | "repair";

const EXPLICIT_IMPLEMENTATION_TYPE_MAP: Partial<Record<ConventionalTitleType, HarnessCommitType>> =
  {
    dev: "dev",
    docs: "docs",
    fix: "fix",
    test: "test",
  };

const DEFAULT_HARNESS_COMMIT_SUMMARY = "update harness changes";

const normalizeHarnessCommitSummary = (summary: string | null | undefined): string => {
  return (
    resolveRequestTitleSubject(summary) ??
    normalizeRequestTitle(summary) ??
    DEFAULT_HARNESS_COMMIT_SUMMARY
  );
};

export const classifyHarnessCommitType = ({
  intent = "implementation",
  conventionalTitle = null,
}: {
  intent?: HarnessCommitIntent;
  conventionalTitle?: ConventionalTitleMetadata | null;
}): HarnessCommitType => {
  if (intent === "proposal" || intent === "archive") {
    return "docs";
  }

  if (intent === "repair") {
    return "fix";
  }

  const conventionalType = conventionalTitle?.type;

  return conventionalType ? (EXPLICIT_IMPLEMENTATION_TYPE_MAP[conventionalType] ?? "dev") : "dev";
};

export const formatHarnessCommitMessage = ({
  summary,
  intent = "implementation",
  conventionalTitle = null,
}: {
  summary: string | null | undefined;
  intent?: HarnessCommitIntent;
  conventionalTitle?: ConventionalTitleMetadata | null;
}): string => {
  return `${classifyHarnessCommitType({
    intent,
    conventionalTitle,
  })}: ${normalizeHarnessCommitSummary(summary)}`;
};
