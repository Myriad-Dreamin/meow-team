import { describe, expect, it, vi } from "vitest";
import { OPEN_WORKSPACE_COMMAND } from "./constants";
import { VscodeAttentionNotifier } from "./attention-notifier";

const getNotificationsMock = vi.hoisted(() => vi.fn());
const normalizeBackendBaseUrlMock = vi.hoisted(() => vi.fn((value: string) => value.trim()));

vi.mock("./team-client", () => {
  return {
    getNotifications: getNotificationsMock,
    normalizeBackendBaseUrl: normalizeBackendBaseUrlMock,
  };
});

const createNotifier = () => {
  const update = vi.fn(async (_key: string, _value: unknown) => {
    void _key;
    void _value;
    return undefined;
  });
  const getConfiguration = vi.fn(() => ({
    get<T>(_section: string, _defaultValue?: T) {
      void _section;
      void _defaultValue;
      return "http://127.0.0.1:3000" as T;
    },
  }));
  const state = {
    get<T>(_key: string, fallbackValue?: T) {
      void _key;
      return fallbackValue as T;
    },
    update,
  };
  const executeCommand = vi.fn(async (_command: string, ..._args: unknown[]) => {
    void _command;
    void _args;
    return undefined;
  });
  const showErrorMessage = vi.fn(async (_message: string, ..._items: string[]) => {
    void _message;
    void _items;
    return undefined as string | undefined;
  });
  const showWarningMessage = vi.fn(async (_message: string, ..._items: string[]) => {
    void _message;
    void _items;
    return undefined as string | undefined;
  });
  const api = {
    commands: {
      executeCommand: executeCommand as never,
    },
    window: {
      showErrorMessage,
      showWarningMessage,
    },
    workspace: {
      getConfiguration: getConfiguration as never,
    },
  };

  return {
    api,
    notifier: new VscodeAttentionNotifier(state, api),
    state,
  };
};

describe("VscodeAttentionNotifier", () => {
  it("delivers approval and failure alerts when the backend target is vscode", async () => {
    const { api, notifier, state } = createNotifier();
    getNotificationsMock.mockResolvedValue({
      generatedAt: "2026-04-14T00:00:00.000Z",
      target: "vscode",
      notifications: [
        {
          body: "Proposal 1 is waiting for human approval in thread thread-1.",
          fingerprint: "fingerprint-approval",
          laneId: "lane-1",
          reason: "awaiting_human_approval",
          tag: "thread-attention:lane-1:awaiting_human_approval",
          threadId: "thread-1",
          title: "Example request requires approval",
        },
        {
          body: "Proposal 1 failed in thread thread-1. Open the thread for details.",
          fingerprint: "fingerprint-failure",
          laneId: "lane-1",
          reason: "lane_failed",
          tag: "thread-attention:lane-1:lane_failed",
          threadId: "thread-1",
          title: "Example request failed",
        },
      ],
    });

    await notifier.refresh();

    expect(api.window.showWarningMessage).toHaveBeenCalledOnce();
    expect(api.window.showErrorMessage).toHaveBeenCalledOnce();
    expect(state.update).toHaveBeenCalledWith("meowTeam.vscodeAttention.delivered", [
      "fingerprint-approval",
      "fingerprint-failure",
    ]);
  });

  it("opens the workspace when the alert action is chosen", async () => {
    const { api, notifier } = createNotifier();
    getNotificationsMock.mockResolvedValue({
      generatedAt: "2026-04-14T00:00:00.000Z",
      target: "vscode",
      notifications: [
        {
          body: "Proposal 1 is waiting for human approval in thread thread-1.",
          fingerprint: "fingerprint-approval",
          laneId: "lane-1",
          reason: "awaiting_human_approval",
          tag: "thread-attention:lane-1:awaiting_human_approval",
          threadId: "thread-1",
          title: "Example request requires approval",
        },
      ],
    });
    api.window.showWarningMessage.mockResolvedValue("Open Workspace");

    await notifier.refresh();

    expect(api.commands.executeCommand).toHaveBeenCalledWith(OPEN_WORKSPACE_COMMAND);
  });

  it("skips delivery when the backend routes notifications to the browser", async () => {
    const { api, notifier, state } = createNotifier();
    getNotificationsMock.mockResolvedValue({
      generatedAt: "2026-04-14T00:00:00.000Z",
      target: "browser",
      notifications: [
        {
          body: "Proposal 1 is waiting for human approval in thread thread-1.",
          fingerprint: "fingerprint-approval",
          laneId: "lane-1",
          reason: "awaiting_human_approval",
          tag: "thread-attention:lane-1:awaiting_human_approval",
          threadId: "thread-1",
          title: "Example request requires approval",
        },
      ],
    });

    await notifier.refresh();

    expect(api.window.showWarningMessage).not.toHaveBeenCalled();
    expect(api.window.showErrorMessage).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });
});
