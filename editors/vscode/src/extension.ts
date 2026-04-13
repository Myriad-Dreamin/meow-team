import * as vscode from "vscode";
import { activateExtension } from "./extension-core";

export function activate(context: vscode.ExtensionContext) {
  activateExtension(context, {
    commands: vscode.commands,
    window: vscode.window,
    workspace: vscode.workspace,
  });
}

export function deactivate() {
  // VS Code disposes subscriptions automatically.
}
