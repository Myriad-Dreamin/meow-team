import type * as vscode from "vscode";
import { createVscodeAttentionNotifier, type AttentionNotifier } from "./attention-notifier";
import {
  EXTENSION_CONTAINER_ID,
  EXTENSION_CONTEXT_KEY,
  OPEN_BACKEND_SETTINGS_COMMAND,
  OPEN_WORKSPACE_COMMAND,
  REFRESH_WORKSPACE_COMMAND,
  WORKSPACE_VIEW_ID,
} from "./constants";
import { MeowTeamWorkspaceViewProvider } from "./workspace-view-provider";

type MinimalCommandApi = Pick<typeof vscode.commands, "executeCommand" | "registerCommand">;
type MinimalWindowApi = Pick<
  typeof vscode.window,
  "registerWebviewViewProvider" | "showErrorMessage" | "showWarningMessage"
>;
type MinimalWorkspaceApi = Pick<
  typeof vscode.workspace,
  "getConfiguration" | "onDidChangeConfiguration"
>;

type MinimalVscodeApi = {
  commands: MinimalCommandApi;
  window: MinimalWindowApi;
  workspace: MinimalWorkspaceApi;
};

type ActivateExtensionDependencies = {
  createAttentionNotifier?: (
    context: Pick<vscode.ExtensionContext, "globalState">,
    api: Pick<MinimalVscodeApi, "commands" | "window" | "workspace">,
  ) => AttentionNotifier;
};

export const activateExtension = (
  context: vscode.ExtensionContext,
  api: MinimalVscodeApi,
  dependencies: ActivateExtensionDependencies = {},
) => {
  const provider = new MeowTeamWorkspaceViewProvider(context);
  const attentionNotifier = (dependencies.createAttentionNotifier ?? createVscodeAttentionNotifier)(
    context,
    api,
  );

  context.subscriptions.push(provider);
  context.subscriptions.push(attentionNotifier);
  context.subscriptions.push(api.window.registerWebviewViewProvider(WORKSPACE_VIEW_ID, provider));
  context.subscriptions.push(
    api.commands.registerCommand(OPEN_WORKSPACE_COMMAND, async () => {
      await api.commands.executeCommand(`workbench.view.extension.${EXTENSION_CONTAINER_ID}`);
    }),
  );
  context.subscriptions.push(
    api.commands.registerCommand(REFRESH_WORKSPACE_COMMAND, async () => {
      await provider.refresh();
    }),
  );
  context.subscriptions.push(
    api.commands.registerCommand(OPEN_BACKEND_SETTINGS_COMMAND, async () => {
      await api.commands.executeCommand("workbench.action.openSettings", "meowTeam.backendBaseUrl");
    }),
  );
  context.subscriptions.push(
    api.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("meowTeam.backendBaseUrl")) {
        provider.handleConfigurationChange();
        attentionNotifier.handleConfigurationChange();
      }
    }),
  );
  attentionNotifier.start();
  void api.commands.executeCommand("setContext", EXTENSION_CONTEXT_KEY, true);

  return provider;
};
