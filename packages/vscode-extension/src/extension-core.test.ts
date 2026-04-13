import { describe, expect, it, vi } from "vitest";
import { activateExtension } from "./extension-core";
import {
  OPEN_BACKEND_SETTINGS_COMMAND,
  OPEN_WORKSPACE_COMMAND,
  REFRESH_WORKSPACE_COMMAND,
  WORKSPACE_VIEW_ID,
} from "./constants";

const createContext = () => {
  const subscriptions: Array<{ dispose: () => void }> = [];

  return {
    extensionUri: {
      toString: () => "file:///extension",
    },
    subscriptions: {
      push: (...items: Array<{ dispose: () => void }>) => {
        subscriptions.push(...items);
        return subscriptions.length;
      },
    },
  };
};

describe("activateExtension", () => {
  it("registers the workspace view, commands, and configuration listener", () => {
    const registerCommand = vi.fn(() => ({ dispose: vi.fn() }));
    const executeCommand = vi.fn(async () => undefined);
    const registerWebviewViewProvider = vi.fn(() => ({ dispose: vi.fn() }));
    const onDidChangeConfiguration = vi.fn(() => ({ dispose: vi.fn() }));

    activateExtension(createContext() as never, {
      commands: {
        executeCommand,
        registerCommand,
      },
      window: {
        registerWebviewViewProvider,
      },
      workspace: {
        getConfiguration: vi.fn(() => ({
          get: vi.fn(() => "http://127.0.0.1:3000"),
        })),
        onDidChangeConfiguration,
      },
    });

    expect(registerWebviewViewProvider).toHaveBeenCalledWith(WORKSPACE_VIEW_ID, expect.any(Object));
    expect(registerCommand).toHaveBeenCalledWith(OPEN_WORKSPACE_COMMAND, expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith(REFRESH_WORKSPACE_COMMAND, expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith(
      OPEN_BACKEND_SETTINGS_COMMAND,
      expect.any(Function),
    );
    expect(onDidChangeConfiguration).toHaveBeenCalledOnce();
    expect(executeCommand).toHaveBeenCalledWith("setContext", "meowTeam.workspaceEnabled", true);
  });
});
