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
    globalState: {
      get: vi.fn(<T>(_key: string, fallbackValue?: T) => {
        void _key;
        return fallbackValue as T;
      }),
      update: vi.fn(async (_key: string, _value: unknown) => {
        void _key;
        void _value;
        return undefined;
      }),
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
    const executeCommand = vi.fn(async (_command: string, ..._args: unknown[]) => {
      void _command;
      void _args;
      return undefined;
    });
    const registerWebviewViewProvider = vi.fn(() => ({ dispose: vi.fn() }));
    const onDidChangeConfiguration = vi.fn(() => ({ dispose: vi.fn() }));
    const getConfiguration = vi.fn(() => ({
      get<T>(_section: string, _defaultValue?: T) {
        void _section;
        void _defaultValue;
        return "http://127.0.0.1:3000" as T;
      },
    }));
    const attentionNotifier = {
      dispose: vi.fn(),
      handleConfigurationChange: vi.fn(),
      refresh: vi.fn(async () => undefined),
      start: vi.fn(),
    };
    const createAttentionNotifier = vi.fn(() => attentionNotifier);

    activateExtension(
      createContext() as never,
      {
        commands: {
          executeCommand: executeCommand as never,
          registerCommand,
        },
        window: {
          registerWebviewViewProvider,
          showErrorMessage: vi.fn(async (_message: string, ..._items: string[]) => {
            void _message;
            void _items;
            return undefined as string | undefined;
          }),
          showWarningMessage: vi.fn(async (_message: string, ..._items: string[]) => {
            void _message;
            void _items;
            return undefined as string | undefined;
          }),
        },
        workspace: {
          getConfiguration: getConfiguration as never,
          onDidChangeConfiguration,
        },
      },
      { createAttentionNotifier },
    );

    expect(registerWebviewViewProvider).toHaveBeenCalledWith(WORKSPACE_VIEW_ID, expect.any(Object));
    expect(registerCommand).toHaveBeenCalledWith(OPEN_WORKSPACE_COMMAND, expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith(REFRESH_WORKSPACE_COMMAND, expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith(
      OPEN_BACKEND_SETTINGS_COMMAND,
      expect.any(Function),
    );
    expect(onDidChangeConfiguration).toHaveBeenCalledOnce();
    expect(createAttentionNotifier).toHaveBeenCalledOnce();
    expect(attentionNotifier.start).toHaveBeenCalledOnce();
    expect(executeCommand).toHaveBeenCalledWith("setContext", "meowTeam.workspaceEnabled", true);
  });
});
