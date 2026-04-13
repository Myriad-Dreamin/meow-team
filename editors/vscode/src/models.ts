export type TeamRoleDecision = "continue" | "approved" | "needs_revision";

export type TeamThreadStatus =
  | "planning"
  | "running"
  | "awaiting_human_approval"
  | "completed"
  | "approved"
  | "needs_revision"
  | "failed";

export type TeamWorkerLaneStatus =
  | "idle"
  | "queued"
  | "coding"
  | "reviewing"
  | "awaiting_human_approval"
  | "approved"
  | "failed";

export type TeamHumanFeedbackScope = "assignment" | "proposal";

export type TeamApprovalTarget = "proposal" | "pull_request";
export type TeamNotificationTarget = "browser" | "vscode";
export type TeamAttentionNotificationReason =
  | "awaiting_human_approval"
  | "lane_failed"
  | "thread_failed";

export type TeamRepositoryOption = {
  id: string;
  name: string;
  rootId: string;
  rootLabel: string;
  path: string;
  relativePath: string;
};

export type TeamRepositoryPickerModel = {
  suggestedRepositories: TeamRepositoryOption[];
  remainingRepositories: TeamRepositoryOption[];
  orderedRepositories: TeamRepositoryOption[];
};

export type TeamPlannerNote = {
  id: string;
  message: string;
  createdAt: string;
};

export type TeamHumanFeedbackRecord = {
  id: string;
  scope: TeamHumanFeedbackScope;
  laneId: string | null;
  message: string;
  createdAt: string;
};

export type TeamRoleHandoff = {
  roleId: string;
  roleName: string;
  summary: string;
  deliverable: string;
  decision: TeamRoleDecision;
  sequence: number;
  assignmentNumber: number;
  updatedAt: string;
};

export type TeamExecutionStep = {
  agentName: string;
  createdAt: string;
  text: string;
};

export type TeamPullRequestRecord = {
  id: string;
  provider: "local-ci" | "github";
  title: string;
  summary: string | null;
  branchName: string;
  baseBranch: string;
  status: "draft" | "awaiting_human_approval" | "approved" | "conflict" | "failed";
  requestedAt: string;
  humanApprovalRequestedAt: string | null;
  humanApprovedAt: string | null;
  machineReviewedAt: string | null;
  updatedAt: string;
  url: string | null;
};

export type TeamWorkerLaneRecord = {
  laneId: string;
  laneIndex: number;
  status: TeamWorkerLaneStatus;
  executionPhase: "implementation" | "final_archive" | null;
  taskTitle: string | null;
  taskObjective: string | null;
  proposalChangeName: string | null;
  proposalPath: string | null;
  workerSlot: number | null;
  branchName: string | null;
  baseBranch: string | null;
  worktreePath: string | null;
  latestImplementationCommit: string | null;
  latestCoderSummary: string | null;
  latestReviewerSummary: string | null;
  latestDecision: TeamRoleDecision | null;
  latestActivity: string | null;
  approvalRequestedAt: string | null;
  approvalGrantedAt: string | null;
  queuedAt: string | null;
  runCount: number;
  revisionCount: number;
  lastError: string | null;
  pullRequest: TeamPullRequestRecord | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type TeamDispatchAssignment = {
  assignmentNumber: number;
  status: string;
  repository: TeamRepositoryOption | null;
  requestTitle: string | null;
  requestText: string | null;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  plannerSummary: string | null;
  plannerDeliverable: string | null;
  branchPrefix: string | null;
  canonicalBranchName: string | null;
  baseBranch: string | null;
  workerCount: number;
  lanes: TeamWorkerLaneRecord[];
  plannerNotes: TeamPlannerNote[];
  humanFeedback: TeamHumanFeedbackRecord[];
  supersededAt: string | null;
  supersededReason: string | null;
};

export type TeamThreadSummary = {
  threadId: string;
  assignmentNumber: number;
  status: TeamThreadStatus;
  archivedAt: string | null;
  requestTitle: string;
  requestText: string | null;
  latestInput: string | null;
  repository: TeamRepositoryOption | null;
  workflow: string[];
  latestRoleId: string | null;
  latestRoleName: string | null;
  nextRoleId: string | null;
  latestDecision: TeamRoleDecision | null;
  handoffCount: number;
  stepCount: number;
  userMessageCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  lastError: string | null;
  latestAssignmentStatus: string | null;
  latestPlanSummary: string | null;
  latestBranchPrefix: string | null;
  latestCanonicalBranchName: string | null;
  dispatchWorkerCount: number;
  workerCounts: Record<string, number>;
  workerLanes: TeamWorkerLaneRecord[];
  plannerNotes: TeamPlannerNote[];
  humanFeedback: TeamHumanFeedbackRecord[];
};

export type TeamThreadUserMessage = {
  id: string;
  role: "user";
  content: string;
  timestamp: string;
};

export type TeamThreadDetail = {
  summary: TeamThreadSummary;
  userMessages: TeamThreadUserMessage[];
  steps: TeamExecutionStep[];
  handoffs: TeamRoleHandoff[];
  dispatchAssignments: TeamDispatchAssignment[];
};

export type TeamWorkspaceResponse = {
  threads: TeamThreadSummary[];
  archivedThreads: TeamThreadSummary[];
  repositoryPicker: TeamRepositoryPickerModel;
};

export type TeamAttentionNotification = {
  body: string;
  fingerprint: string;
  laneId: string | null;
  reason: TeamAttentionNotificationReason;
  tag: string;
  threadId: string;
  title: string;
};

export type TeamNotificationsResponse = {
  generatedAt: string;
  notifications: TeamAttentionNotification[];
  target: TeamNotificationTarget;
};

export type TeamThreadDetailResponse = {
  thread: TeamThreadDetail;
};

export type TeamRunSummary = {
  threadId: string | null;
  assignmentNumber: number;
  requestTitle: string;
  requestText: string;
  approved: boolean;
  repository: TeamRepositoryOption | null;
  workflow: string[];
  handoffs: TeamRoleHandoff[];
  steps: TeamExecutionStep[];
};

export type TeamRunAcceptedStreamEvent = {
  type: "accepted";
  threadId: string;
  startedAt: string;
  status: "running";
};

export type TeamCodexLogEntry = {
  id: string;
  source: "stdout" | "stderr" | "system";
  message: string;
  createdAt: string;
  threadId: string;
  assignmentNumber: number | null;
  roleId: string | null;
  laneId: string | null;
};

export type TeamRunCodexEventStreamEvent = {
  type: "codex_event";
  entry: TeamCodexLogEntry;
};

export type TeamRunResultStreamEvent = {
  type: "result";
  result: TeamRunSummary;
};

export type TeamRunErrorStreamEvent = {
  type: "error";
  threadId: string;
  error: string;
};

export type TeamRunBranchDeleteRequiredStreamEvent = {
  type: "branch_delete_required";
  threadId: string;
  error: string;
  branches: string[];
};

export type TeamRunStreamEvent =
  | TeamRunAcceptedStreamEvent
  | TeamRunCodexEventStreamEvent
  | TeamRunResultStreamEvent
  | TeamRunErrorStreamEvent
  | TeamRunBranchDeleteRequiredStreamEvent;

export type TeamRunRequest = {
  input: string;
  title?: string;
  threadId?: string;
  repositoryId?: string;
  reset?: boolean;
  deleteExistingBranches?: boolean;
};

export type TeamApprovalRequest = {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  target?: TeamApprovalTarget;
};

export type TeamFeedbackRequest = {
  threadId: string;
  assignmentNumber: number;
  scope: TeamHumanFeedbackScope;
  laneId?: string;
  suggestion: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isString = (value: unknown): value is string => typeof value === "string";

const isNumber = (value: unknown): value is number => typeof value === "number";

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every(isString);
};

const isNotificationTarget = (value: unknown): value is TeamNotificationTarget => {
  return value === "browser" || value === "vscode";
};

const isRepositoryOption = (value: unknown): value is TeamRepositoryOption => {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.rootId) &&
    isString(value.rootLabel) &&
    isString(value.path) &&
    isString(value.relativePath)
  );
};

const isRepositoryPickerModel = (value: unknown): value is TeamRepositoryPickerModel => {
  return (
    isRecord(value) &&
    Array.isArray(value.orderedRepositories) &&
    value.orderedRepositories.every(isRepositoryOption) &&
    Array.isArray(value.suggestedRepositories) &&
    value.suggestedRepositories.every(isRepositoryOption) &&
    Array.isArray(value.remainingRepositories) &&
    value.remainingRepositories.every(isRepositoryOption)
  );
};

const isWorkerLaneRecord = (value: unknown): value is TeamWorkerLaneRecord => {
  return (
    isRecord(value) &&
    isString(value.laneId) &&
    isNumber(value.laneIndex) &&
    isString(value.status) &&
    isString(value.updatedAt)
  );
};

const isPlannerNote = (value: unknown): value is TeamPlannerNote => {
  return (
    isRecord(value) && isString(value.id) && isString(value.message) && isString(value.createdAt)
  );
};

const isHumanFeedbackRecord = (value: unknown): value is TeamHumanFeedbackRecord => {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.scope) &&
    (value.laneId === null || isString(value.laneId)) &&
    isString(value.message) &&
    isString(value.createdAt)
  );
};

const isThreadSummary = (value: unknown): value is TeamThreadSummary => {
  return (
    isRecord(value) &&
    isString(value.threadId) &&
    isString(value.requestTitle) &&
    isString(value.status) &&
    isString(value.updatedAt) &&
    Array.isArray(value.workerLanes) &&
    value.workerLanes.every(isWorkerLaneRecord) &&
    Array.isArray(value.workflow) &&
    value.workflow.every(isString) &&
    Array.isArray(value.plannerNotes) &&
    value.plannerNotes.every(isPlannerNote) &&
    Array.isArray(value.humanFeedback) &&
    value.humanFeedback.every(isHumanFeedbackRecord) &&
    (value.repository === null || isRepositoryOption(value.repository))
  );
};

export const isWorkspaceResponse = (value: unknown): value is TeamWorkspaceResponse => {
  return (
    isRecord(value) &&
    Array.isArray(value.threads) &&
    value.threads.every(isThreadSummary) &&
    Array.isArray(value.archivedThreads) &&
    value.archivedThreads.every(isThreadSummary) &&
    isRepositoryPickerModel(value.repositoryPicker)
  );
};

const isAttentionNotification = (value: unknown): value is TeamAttentionNotification => {
  return (
    isRecord(value) &&
    isString(value.body) &&
    isString(value.fingerprint) &&
    (value.laneId === null || isString(value.laneId)) &&
    isString(value.reason) &&
    isString(value.tag) &&
    isString(value.threadId) &&
    isString(value.title)
  );
};

export const isNotificationsResponse = (value: unknown): value is TeamNotificationsResponse => {
  return (
    isRecord(value) &&
    isString(value.generatedAt) &&
    isNotificationTarget(value.target) &&
    Array.isArray(value.notifications) &&
    value.notifications.every(isAttentionNotification)
  );
};

export const isThreadDetailResponse = (value: unknown): value is TeamThreadDetailResponse => {
  return (
    isRecord(value) &&
    isRecord(value.thread) &&
    isThreadSummary(value.thread.summary) &&
    Array.isArray(value.thread.userMessages) &&
    Array.isArray(value.thread.steps) &&
    Array.isArray(value.thread.handoffs) &&
    Array.isArray(value.thread.dispatchAssignments)
  );
};

export const isRunSummary = (value: unknown): value is TeamRunSummary => {
  return (
    isRecord(value) &&
    (value.threadId === null || isString(value.threadId)) &&
    isNumber(value.assignmentNumber) &&
    isString(value.requestTitle) &&
    isString(value.requestText) &&
    typeof value.approved === "boolean" &&
    Array.isArray(value.workflow) &&
    value.workflow.every(isString) &&
    Array.isArray(value.handoffs) &&
    Array.isArray(value.steps)
  );
};

export const isAcceptedStreamEvent = (value: unknown): value is TeamRunAcceptedStreamEvent => {
  return (
    isRecord(value) &&
    value.type === "accepted" &&
    value.status === "running" &&
    isString(value.threadId) &&
    isString(value.startedAt)
  );
};

export const isCodexEventStreamEvent = (value: unknown): value is TeamRunCodexEventStreamEvent => {
  return (
    isRecord(value) &&
    value.type === "codex_event" &&
    isRecord(value.entry) &&
    isString(value.entry.id) &&
    isString(value.entry.message) &&
    isString(value.entry.createdAt)
  );
};

export const isResultStreamEvent = (value: unknown): value is TeamRunResultStreamEvent => {
  return isRecord(value) && value.type === "result" && isRunSummary(value.result);
};

export const isErrorStreamEvent = (value: unknown): value is TeamRunErrorStreamEvent => {
  return (
    isRecord(value) && value.type === "error" && isString(value.threadId) && isString(value.error)
  );
};

export const isBranchDeleteRequiredStreamEvent = (
  value: unknown,
): value is TeamRunBranchDeleteRequiredStreamEvent => {
  return (
    isRecord(value) &&
    value.type === "branch_delete_required" &&
    isString(value.threadId) &&
    isString(value.error) &&
    isStringArray(value.branches)
  );
};

export const readErrorMessage = (value: unknown): string | null => {
  if (!isRecord(value) || !isString(value.error) || !value.error.trim()) {
    return null;
  }

  return value.error;
};
