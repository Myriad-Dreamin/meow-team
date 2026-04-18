import { isTerminalTeamThreadStatus } from "@/components/team-thread-status";
import type { ThreadRepositoryGroup } from "@/components/team-workspace-sidebar";
import type { TeamThreadSummary } from "@/lib/team/history";

export type TeamWorkspaceShortcutAction =
  | {
      type: "select-run-tab";
    }
  | {
      type: "select-thread-index";
      index: number;
    };

export type TeamWorkspaceShortcutTarget =
  | {
      type: "run";
    }
  | {
      type: "thread";
      threadId: string;
    };

type TeamWorkspaceShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey" | "target"
>;

type ShortcutScope = "run" | "settings" | "thread";

type EditableTargetLike = {
  getAttribute?: (name: string) => string | null;
  isContentEditable?: boolean;
  parentElement?: unknown;
  tagName?: string;
};

const isEditableTargetLike = (value: unknown): value is EditableTargetLike => {
  return typeof value === "object" && value !== null;
};

const isEditableShortcutTarget = (target: EventTarget | null): boolean => {
  let currentTarget: EditableTargetLike | null = isEditableTargetLike(target) ? target : null;

  while (currentTarget) {
    const tagName = currentTarget.tagName?.toUpperCase();
    if (tagName === "INPUT" || tagName === "TEXTAREA") {
      return true;
    }

    if (currentTarget.isContentEditable) {
      return true;
    }

    const contentEditableAttribute =
      typeof currentTarget.getAttribute === "function"
        ? currentTarget.getAttribute("contenteditable")
        : null;
    if (contentEditableAttribute !== null && contentEditableAttribute !== "false") {
      return true;
    }

    currentTarget = isEditableTargetLike(currentTarget.parentElement)
      ? currentTarget.parentElement
      : null;
  }

  return false;
};

export const parseTeamWorkspaceShortcutAction = (
  event: TeamWorkspaceShortcutKeyboardEvent,
): TeamWorkspaceShortcutAction | null => {
  if (
    !event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    isEditableShortcutTarget(event.target)
  ) {
    return null;
  }

  if (event.key.toLowerCase() === "n") {
    return {
      type: "select-run-tab",
    };
  }

  if (event.key >= "1" && event.key <= "9") {
    return {
      type: "select-thread-index",
      index: Number(event.key),
    };
  }

  return null;
};

export const buildActiveLivingThreadShortcutTargets = (
  livingThreadGroups: ThreadRepositoryGroup[],
): TeamThreadSummary[] => {
  return livingThreadGroups.flatMap((group) =>
    group.threads.filter((thread) => !isTerminalTeamThreadStatus(thread.status)),
  );
};

const resolveThreadShortcutTarget = (
  livingThreadGroups: ThreadRepositoryGroup[],
  index: number,
): TeamThreadSummary | null => {
  return buildActiveLivingThreadShortcutTargets(livingThreadGroups)[index - 1] ?? null;
};

export const resolveTeamWorkspaceShortcutTarget = ({
  event,
  livingThreadGroups,
  selectedTabType,
}: {
  event: TeamWorkspaceShortcutKeyboardEvent;
  livingThreadGroups: ThreadRepositoryGroup[];
  selectedTabType: ShortcutScope;
}): TeamWorkspaceShortcutTarget | null => {
  if (selectedTabType !== "thread") {
    return null;
  }

  const action = parseTeamWorkspaceShortcutAction(event);
  if (!action) {
    return null;
  }

  if (action.type === "select-run-tab") {
    return {
      type: "run",
    };
  }

  const targetThread = resolveThreadShortcutTarget(livingThreadGroups, action.index);
  return targetThread
    ? {
        type: "thread",
        threadId: targetThread.threadId,
      }
    : null;
};
