import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const SUPPORTED_STAGES = ["plan", "code", "review", "execute", "validate"] as const;

export type MeowFlowStage = (typeof SUPPORTED_STAGES)[number];
export type DerivedThreadStage = MeowFlowStage | "archived";
export type MeowFlowSkill =
  | "meow-plan"
  | "meow-code"
  | "meow-review"
  | "meow-execute"
  | "meow-validate"
  | "meow-archive";

export type ThreadAgentRecord = {
  readonly id: string;
  readonly title: string | null;
  readonly skill: MeowFlowSkill;
  readonly createdAt: string;
};

export type ThreadHandoffRecord = {
  readonly seq: number;
  readonly stage: MeowFlowStage;
  readonly content: string;
  readonly createdAt: string;
};

export type ThreadRecord = {
  readonly id: string;
  readonly name: string | null;
  readonly requestBody: string | null;
  readonly archivedAt: string | null;
  readonly agents: readonly ThreadAgentRecord[];
  readonly handoffs: readonly ThreadHandoffRecord[];
};

export type ThreadOccupationRecord = {
  readonly threadId: string;
  readonly worktreePath: string;
  readonly createdAt: string;
  readonly releasedAt: string | null;
};

export type MeowFlowState = {
  readonly version: 1;
  readonly occupations: readonly ThreadOccupationRecord[];
  readonly threads: readonly ThreadRecord[];
};

export type MutableMeowFlowState = {
  version: 1;
  occupations: ThreadOccupationRecord[];
  threads: ThreadRecord[];
};

type UnknownRecord = Record<string, unknown>;

const STATE_DIRECTORY_NAME = "meow-flow";
const STATE_FILE_NAME = "state.json";

export function createEmptyState(): MutableMeowFlowState {
  return {
    version: 1,
    occupations: [],
    threads: [],
  };
}

export function getStateFilePath(repositoryRoot: string): string {
  return path.join(repositoryRoot, ".git", STATE_DIRECTORY_NAME, STATE_FILE_NAME);
}

export function readMeowFlowState(repositoryRoot: string): MutableMeowFlowState {
  const statePath = getStateFilePath(repositoryRoot);

  if (!existsSync(statePath)) {
    return createEmptyState();
  }

  const parsed = JSON.parse(readFileSync(statePath, "utf8")) as unknown;
  return normalizeState(parsed);
}

export function writeMeowFlowState(repositoryRoot: string, state: MeowFlowState): void {
  const statePath = getStateFilePath(repositoryRoot);
  const stateDirectory = path.dirname(statePath);
  mkdirSync(stateDirectory, { recursive: true });

  const temporaryPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, statePath);
}

export function updateMeowFlowState(
  repositoryRoot: string,
  updater: (state: MutableMeowFlowState) => void,
): MutableMeowFlowState {
  const state = readMeowFlowState(repositoryRoot);
  updater(state);
  writeMeowFlowState(repositoryRoot, state);
  return state;
}

export function isSupportedStage(value: string): value is MeowFlowStage {
  return SUPPORTED_STAGES.includes(value as MeowFlowStage);
}

export function parseStage(value: string | undefined): MeowFlowStage | null {
  if (value === undefined) {
    return null;
  }

  const stage = value.trim();
  if (isSupportedStage(stage)) {
    return stage;
  }

  throw new Error(`Stage must be one of ${SUPPORTED_STAGES.join(", ")}.`);
}

export function stageToSkill(stage: MeowFlowStage): MeowFlowSkill {
  switch (stage) {
    case "plan":
      return "meow-plan";
    case "code":
      return "meow-code";
    case "review":
      return "meow-review";
    case "execute":
      return "meow-execute";
    case "validate":
      return "meow-validate";
  }
}

export function skillToStage(skill: string | null | undefined): DerivedThreadStage | null {
  switch (skill) {
    case "meow-plan":
      return "plan";
    case "meow-code":
      return "code";
    case "meow-review":
      return "review";
    case "meow-execute":
      return "execute";
    case "meow-validate":
      return "validate";
    case "meow-archive":
      return "archived";
    default:
      return null;
  }
}

export function isSupportedSkill(skill: string): skill is MeowFlowSkill {
  return skillToStage(skill) !== null;
}

export function deriveLatestStage(thread: ThreadRecord): DerivedThreadStage {
  if (isThreadArchived(thread)) {
    return "archived";
  }

  const latestAgent = [...thread.agents]
    .filter((agent) => skillToStage(agent.skill) !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);

  if (!latestAgent) {
    return "plan";
  }

  return skillToStage(latestAgent.skill) ?? "plan";
}

export function isThreadArchived(thread: ThreadRecord): boolean {
  if (thread.archivedAt !== null) {
    return true;
  }

  return thread.agents.some((agent) => skillToStage(agent.skill) === "archived");
}

export function getNextHandoffSequence(thread: ThreadRecord): number {
  return thread.handoffs.reduce((max, handoff) => Math.max(max, handoff.seq), 0) + 1;
}

export function getThread(state: MeowFlowState, threadId: string): ThreadRecord | null {
  return state.threads.find((thread) => thread.id === threadId) ?? null;
}

export function ensureThread(
  state: MutableMeowFlowState,
  input: {
    readonly threadId: string;
    readonly requestBody?: string | null;
    readonly now?: string;
  },
): ThreadRecord {
  const existing = state.threads.find((thread) => thread.id === input.threadId);

  if (existing) {
    if (input.requestBody !== undefined && existing.requestBody === null) {
      const nextThread: ThreadRecord = {
        ...existing,
        requestBody: input.requestBody,
      };
      replaceThread(state, nextThread);
      return nextThread;
    }

    return existing;
  }

  const created: ThreadRecord = {
    id: input.threadId,
    name: null,
    requestBody: input.requestBody ?? null,
    archivedAt: null,
    agents: [],
    handoffs: [],
  };

  state.threads.push(created);
  return created;
}

export function replaceThread(state: MutableMeowFlowState, thread: ThreadRecord): void {
  const index = state.threads.findIndex((entry) => entry.id === thread.id);

  if (index === -1) {
    state.threads.push(thread);
    return;
  }

  state.threads.splice(index, 1, thread);
}

export function getActiveOccupationForWorktree(
  state: MeowFlowState,
  worktreePath: string,
): ThreadOccupationRecord | null {
  const resolvedWorktreePath = path.resolve(worktreePath);

  return (
    state.occupations.find(
      (occupation) =>
        occupation.releasedAt === null &&
        path.resolve(occupation.worktreePath) === resolvedWorktreePath,
    ) ?? null
  );
}

export function getActiveOccupationForThread(
  state: MeowFlowState,
  threadId: string,
): ThreadOccupationRecord | null {
  return (
    state.occupations.find(
      (occupation) => occupation.releasedAt === null && occupation.threadId === threadId,
    ) ?? null
  );
}

export function recordOccupation(
  state: MutableMeowFlowState,
  input: {
    readonly threadId: string;
    readonly worktreePath: string;
    readonly now: string;
  },
): ThreadOccupationRecord {
  const activeForWorktree = getActiveOccupationForWorktree(state, input.worktreePath);
  if (activeForWorktree) {
    throw new Error(
      `Worktree is already occupied by thread ${activeForWorktree.threadId}: ${input.worktreePath}`,
    );
  }

  const activeForThread = getActiveOccupationForThread(state, input.threadId);
  if (activeForThread) {
    throw new Error(
      `Thread ${input.threadId} is already running in worktree ${activeForThread.worktreePath}.`,
    );
  }

  const occupation: ThreadOccupationRecord = {
    threadId: input.threadId,
    worktreePath: path.resolve(input.worktreePath),
    createdAt: input.now,
    releasedAt: null,
  };

  state.occupations.push(occupation);
  return occupation;
}

export function removeActiveOccupation(
  state: MutableMeowFlowState,
  input: {
    readonly threadId: string;
    readonly worktreePath: string;
  },
): void {
  const resolvedWorktreePath = path.resolve(input.worktreePath);

  state.occupations = state.occupations.filter(
    (occupation) =>
      !(
        occupation.releasedAt === null &&
        occupation.threadId === input.threadId &&
        path.resolve(occupation.worktreePath) === resolvedWorktreePath
      ),
  );
}

export function releaseActiveOccupation(
  state: MutableMeowFlowState,
  input: {
    readonly threadId: string;
    readonly worktreePath: string;
    readonly now: string;
  },
): void {
  const resolvedWorktreePath = path.resolve(input.worktreePath);

  state.occupations = state.occupations.map((occupation) => {
    if (
      occupation.releasedAt === null &&
      occupation.threadId === input.threadId &&
      path.resolve(occupation.worktreePath) === resolvedWorktreePath
    ) {
      return {
        ...occupation,
        releasedAt: input.now,
      };
    }

    return occupation;
  });
}

export function upsertAgentRecord(
  state: MutableMeowFlowState,
  input: {
    readonly threadId: string;
    readonly agentId: string;
    readonly title: string | null;
    readonly skill: MeowFlowSkill;
    readonly now: string;
  },
): ThreadRecord {
  const thread = ensureThread(state, { threadId: input.threadId });
  const existing = thread.agents.find((agent) => agent.id === input.agentId);
  const nextAgent: ThreadAgentRecord = {
    id: input.agentId,
    title: input.title,
    skill: input.skill,
    createdAt: existing?.createdAt ?? input.now,
  };
  const nextThread: ThreadRecord = {
    ...thread,
    agents: existing
      ? thread.agents.map((agent) => (agent.id === input.agentId ? nextAgent : agent))
      : [...thread.agents, nextAgent],
  };

  replaceThread(state, nextThread);
  return nextThread;
}

export function appendHandoffRecord(
  state: MutableMeowFlowState,
  input: {
    readonly threadId: string;
    readonly stage: MeowFlowStage;
    readonly content: string;
    readonly now: string;
  },
): ThreadHandoffRecord {
  const thread = ensureThread(state, { threadId: input.threadId });
  const handoff: ThreadHandoffRecord = {
    seq: getNextHandoffSequence(thread),
    stage: input.stage,
    content: input.content,
    createdAt: input.now,
  };
  const nextThread: ThreadRecord = {
    ...thread,
    handoffs: [...thread.handoffs, handoff],
  };

  replaceThread(state, nextThread);
  return handoff;
}

export function formatThreadStatus(thread: ThreadRecord): string {
  const lines: string[] = [
    `id: ${formatYamlScalar(thread.id)}`,
    `name: ${thread.name === null ? "null" : formatYamlScalar(thread.name)}`,
    `stage: ${deriveLatestStage(thread)}`,
    `archived: ${isThreadArchived(thread) ? "true" : "false"}`,
  ];

  if (thread.archivedAt !== null) {
    lines.push(`archived-at: ${formatYamlScalar(thread.archivedAt)}`);
  }

  lines.push(formatAgents(thread.agents));
  lines.push(formatBlock("request-body", thread.requestBody));
  lines.push(formatHandoffs(thread.handoffs));

  return `${lines.join("\n")}\n`;
}

export function formatHandoffs(handoffs: readonly ThreadHandoffRecord[]): string {
  if (handoffs.length === 0) {
    return "handoffs: []";
  }

  const lines = ["handoffs:"];

  for (const handoff of handoffs) {
    lines.push(`  - seq: ${handoff.seq}`);
    lines.push(`    stage: ${handoff.stage}`);
    lines.push(formatBlock("content", handoff.content, 4));
    lines.push(`    created: ${formatYamlScalar(handoff.createdAt)}`);
  }

  return lines.join("\n");
}

function normalizeState(parsed: unknown): MutableMeowFlowState {
  if (!isRecord(parsed)) {
    return createEmptyState();
  }

  return {
    version: 1,
    occupations: readArray(parsed.occupations).map(normalizeOccupation).filter(isNotNull),
    threads: readArray(parsed.threads).map(normalizeThread).filter(isNotNull),
  };
}

function normalizeOccupation(value: unknown): ThreadOccupationRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const threadId = readString(value.threadId);
  const worktreePath = readString(value.worktreePath) ?? readString(value.workspacePath);
  const createdAt = readString(value.createdAt) ?? new Date(0).toISOString();

  if (!threadId || !worktreePath) {
    return null;
  }

  return {
    threadId,
    worktreePath: path.resolve(worktreePath),
    createdAt,
    releasedAt: readString(value.releasedAt),
  };
}

function normalizeThread(value: unknown): ThreadRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);

  if (!id) {
    return null;
  }

  return {
    id,
    name: readString(value.name),
    requestBody: readString(value.requestBody),
    archivedAt: readString(value.archivedAt),
    agents: readArray(value.agents).map(normalizeAgent).filter(isNotNull),
    handoffs: readArray(value.handoffs).map(normalizeHandoff).filter(isNotNull),
  };
}

function normalizeAgent(value: unknown): ThreadAgentRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const skill = readString(value.skill);
  const createdAt = readString(value.createdAt) ?? new Date(0).toISOString();

  if (!id || !skill || !isSupportedSkill(skill)) {
    return null;
  }

  return {
    id,
    title: readString(value.title),
    skill,
    createdAt,
  };
}

function normalizeHandoff(value: unknown): ThreadHandoffRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const seq = typeof value.seq === "number" && Number.isInteger(value.seq) ? value.seq : null;
  const stage = readString(value.stage);
  const content = readString(value.content);
  const createdAt = readString(value.createdAt) ?? new Date(0).toISOString();

  if (seq === null || !stage || !isSupportedStage(stage) || content === null) {
    return null;
  }

  return {
    seq,
    stage,
    content,
    createdAt,
  };
}

function formatAgents(agents: readonly ThreadAgentRecord[]): string {
  if (agents.length === 0) {
    return "agents: []";
  }

  const lines = ["agents:"];

  for (const agent of agents) {
    lines.push(`  - id: ${formatYamlScalar(agent.id)}`);
    lines.push(`    title: ${agent.title === null ? "null" : formatYamlScalar(agent.title)}`);
    lines.push(`    skill: ${agent.skill}`);
    lines.push(`    created: ${formatYamlScalar(agent.createdAt)}`);
  }

  return lines.join("\n");
}

function formatBlock(key: string, value: string | null, indentation = 0): string {
  const prefix = " ".repeat(indentation);

  if (value === null || value.length === 0) {
    return `${prefix}${key}: ""`;
  }

  const indented = value
    .split(/\r?\n/)
    .map((line) => `${prefix}  ${line}`)
    .join("\n");

  return `${prefix}${key}: |\n${indented}`;
}

function formatYamlScalar(value: string): string {
  if (/^[A-Za-z0-9._/@:-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}
