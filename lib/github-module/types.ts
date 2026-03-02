export const githubEventKinds = ["standard", "notification"] as const;
export type GitHubEventKind = (typeof githubEventKinds)[number];

export const githubTaskStatuses = ["todo", "done"] as const;
export type GitHubTaskStatus = (typeof githubTaskStatuses)[number];

export const githubTaskSources = ["github-issue"] as const;
export type GitHubTaskSource = (typeof githubTaskSources)[number];

export const githubAchievementMetrics = [
  "events",
  "notificationEvents",
  "completedTasks",
] as const;
export type GitHubAchievementMetric = (typeof githubAchievementMetrics)[number];

export type GitHubEvent = {
  id: string;
  message: string;
  kind: GitHubEventKind;
  createdAt: string;
};

export type GitHubTask = {
  id: string;
  source: GitHubTaskSource;
  title: string;
  detail: string;
  status: GitHubTaskStatus;
  createdAt: string;
  completedAt: string | null;
};

export type GitHubAchievementDefinition = {
  id: string;
  title: string;
  detail: string;
  metric: GitHubAchievementMetric;
  target: number;
  createdAt: string;
};

export type GitHubAchievement = GitHubAchievementDefinition & {
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
};

export type GitHubReplHistoryItem = {
  id: string;
  input: string;
  output: string[];
  success: boolean;
  createdAt: string;
};

export type GitHubModuleState = {
  events: GitHubEvent[];
  tasks: GitHubTask[];
  achievementDefinitions: GitHubAchievementDefinition[];
  achievements: GitHubAchievement[];
  replHistory: GitHubReplHistoryItem[];
};

const defaultAchievementSeeds: Omit<GitHubAchievementDefinition, "createdAt">[] = [
  {
    id: "first-event",
    title: "First Signal",
    detail: "Capture your first event in the stream.",
    metric: "events",
    target: 1,
  },
  {
    id: "notification-scout",
    title: "Notification Scout",
    detail: "Record a notification event.",
    metric: "notificationEvents",
    target: 1,
  },
  {
    id: "task-closer",
    title: "Issue Closer",
    detail: "Complete one GitHub issue task from the board.",
    metric: "completedTasks",
    target: 1,
  },
];

export const isGitHubEventKind = (value: unknown): value is GitHubEventKind => {
  return githubEventKinds.includes(value as GitHubEventKind);
};

export const isGitHubTaskStatus = (value: unknown): value is GitHubTaskStatus => {
  return githubTaskStatuses.includes(value as GitHubTaskStatus);
};

export const isGitHubTaskSource = (value: unknown): value is GitHubTaskSource => {
  return githubTaskSources.includes(value as GitHubTaskSource);
};

export const isGitHubAchievementMetric = (value: unknown): value is GitHubAchievementMetric => {
  return githubAchievementMetrics.includes(value as GitHubAchievementMetric);
};

export const createDefaultGitHubModuleState = (): GitHubModuleState => {
  const createdAt = new Date().toISOString();
  const achievementDefinitions = defaultAchievementSeeds.map((seed) => ({
    ...seed,
    createdAt,
  }));

  return {
    events: [],
    tasks: [],
    achievementDefinitions,
    achievements: achievementDefinitions.map((definition) => ({
      ...definition,
      progress: 0,
      unlocked: false,
      unlockedAt: null,
    })),
    replHistory: [],
  };
};
