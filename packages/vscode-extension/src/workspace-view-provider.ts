import * as vscode from "vscode";
import {
  BACKEND_BASE_URL_SETTING,
  CONFIG_SECTION,
  DEFAULT_BACKEND_BASE_URL,
  WORKSPACE_POLL_INTERVAL_MS,
} from "./constants";
import {
  approveLane,
  buildConnectionGuidance,
  getThreadDetail,
  getWorkspace,
  normalizeBackendBaseUrl,
  runTeam,
  submitFeedback,
  TeamApiError,
  type TeamRunProgressEvent,
} from "./team-client";
import type {
  TeamApprovalRequest,
  TeamFeedbackRequest,
  TeamHumanFeedbackScope,
  TeamThreadDetail,
  TeamWorkspaceResponse,
} from "./models";

type ConnectionState = {
  status: "idle" | "connecting" | "connected" | "error";
  message: string;
  guidance: string;
  checkedAt: string | null;
};

type ActionState = {
  kind: "run" | "approve" | "feedback" | "refresh";
  label: string;
  detail: string | null;
} | null;

type ViewState = {
  backendBaseUrl: string;
  connection: ConnectionState;
  workspace: TeamWorkspaceResponse | null;
  selectedThreadId: string | null;
  selectedThread: TeamThreadDetail | null;
  action: ActionState;
  notice: string | null;
  error: string | null;
};

type WebviewRequestMessage =
  | {
      type: "approve";
      payload: TeamApprovalRequest;
    }
  | {
      type: "feedback";
      payload: TeamFeedbackRequest;
    }
  | {
      type: "open-settings";
      payload?: Record<string, never>;
    }
  | {
      type: "ready";
      payload?: Record<string, never>;
    }
  | {
      type: "refresh";
      payload?: Record<string, never>;
    }
  | {
      type: "run";
      payload: {
        input: string;
        title?: string;
        threadId?: string;
        repositoryId?: string;
        reset?: boolean;
        deleteExistingBranches?: boolean;
      };
    }
  | {
      type: "select-thread";
      payload: {
        threadId?: string | null;
      };
    };

const createNonce = (): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  return Array.from({ length: 32 }, () => {
    return alphabet[Math.floor(Math.random() * alphabet.length)];
  }).join("");
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const readThreadId = (value: unknown): string | null => {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const formatBackendError = (error: unknown): string => {
  if (error instanceof TeamApiError) {
    return error.guidance ? `${error.message} ${error.guidance}` : error.message;
  }

  return error instanceof Error ? error.message : "Unable to update the workspace.";
};

const buildInitialConnectionState = (baseUrl: string): ConnectionState => {
  return {
    status: "idle",
    message: "Waiting for the extension host to connect.",
    guidance: buildConnectionGuidance(baseUrl),
    checkedAt: null,
  };
};

const resolveSelectedThreadId = (
  workspace: TeamWorkspaceResponse | null,
  currentThreadId: string | null,
): string | null => {
  if (!workspace) {
    return currentThreadId;
  }

  const allThreads = [...workspace.threads, ...workspace.archivedThreads];
  if (currentThreadId && allThreads.some((thread) => thread.threadId === currentThreadId)) {
    return currentThreadId;
  }

  return workspace.threads[0]?.threadId ?? workspace.archivedThreads[0]?.threadId ?? null;
};

export class MeowTeamWorkspaceViewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private readonly mediaRoot: vscode.Uri;
  private view: vscode.WebviewView | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<void> | null = null;
  private readonly state: ViewState;

  constructor(context: vscode.ExtensionContext) {
    this.mediaRoot = vscode.Uri.joinPath(context.extensionUri, "media");

    const backendConfiguration = this.readBackendConfiguration();
    this.state = {
      backendBaseUrl: backendConfiguration.displayValue,
      connection: backendConfiguration.baseUrl
        ? buildInitialConnectionState(backendConfiguration.baseUrl)
        : {
            status: "error",
            message: backendConfiguration.error,
            guidance: backendConfiguration.guidance,
            checkedAt: null,
          },
      workspace: null,
      selectedThreadId: null,
      selectedThread: null,
      action: null,
      notice: null,
      error: backendConfiguration.baseUrl ? null : backendConfiguration.error,
    };
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.mediaRoot],
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleWebviewMessage(message);
    });

    webviewView.onDidDispose(() => {
      this.view = null;
      this.stopPolling();
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.startPolling();
        void this.refresh();
      } else {
        this.stopPolling();
      }
    });

    this.postState();
    this.startPolling();
    void this.refresh();
  }

  dispose() {
    this.stopPolling();
  }

  async refresh() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  handleConfigurationChange() {
    const backendConfiguration = this.readBackendConfiguration();
    this.state.backendBaseUrl = backendConfiguration.displayValue;
    this.state.connection = backendConfiguration.baseUrl
      ? buildInitialConnectionState(backendConfiguration.baseUrl)
      : {
          status: "error",
          message: backendConfiguration.error,
          guidance: backendConfiguration.guidance,
          checkedAt: null,
        };
    this.state.error = backendConfiguration.baseUrl ? null : backendConfiguration.error;
    this.postState();
    void this.refresh();
  }

  private readBackendConfiguration(): {
    displayValue: string;
    baseUrl: string | null;
    error: string;
    guidance: string;
  } {
    const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const configuredValue = configuration.get<string>(
      BACKEND_BASE_URL_SETTING,
      DEFAULT_BACKEND_BASE_URL,
    );

    const displayValue = configuredValue.trim() || DEFAULT_BACKEND_BASE_URL;

    try {
      const baseUrl = normalizeBackendBaseUrl(configuredValue);
      return {
        displayValue,
        baseUrl,
        error: "",
        guidance: buildConnectionGuidance(baseUrl),
      };
    } catch (error) {
      return {
        displayValue,
        baseUrl: null,
        error: formatBackendError(error),
        guidance:
          "Update meowTeam.backendBaseUrl to a full http(s) URL for the Next.js app and refresh the workspace.",
      };
    }
  }

  private startPolling() {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.refresh();
    }, WORKSPACE_POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (!this.pollTimer) {
      return;
    }

    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async performRefresh() {
    const backendConfiguration = this.readBackendConfiguration();
    this.state.backendBaseUrl = backendConfiguration.displayValue;

    if (!backendConfiguration.baseUrl) {
      this.state.connection = {
        status: "error",
        message: backendConfiguration.error,
        guidance: backendConfiguration.guidance,
        checkedAt: new Date().toISOString(),
      };
      this.state.error = backendConfiguration.error;
      this.postState();
      return;
    }

    const backendBaseUrl = backendConfiguration.baseUrl;
    this.state.connection = {
      status: "connecting",
      message: "Refreshing the meow-team workspace from the backend.",
      guidance: buildConnectionGuidance(backendBaseUrl),
      checkedAt: this.state.connection.checkedAt,
    };
    this.postState();

    try {
      const workspace = await getWorkspace(backendBaseUrl);
      this.state.workspace = workspace;
      this.state.selectedThreadId = resolveSelectedThreadId(workspace, this.state.selectedThreadId);
      this.state.selectedThread = await this.loadSelectedThread(backendBaseUrl);
      this.state.connection = {
        status: "connected",
        message: "Workspace data is current.",
        guidance: buildConnectionGuidance(backendBaseUrl),
        checkedAt: new Date().toISOString(),
      };
      this.state.error = null;
    } catch (error) {
      this.state.connection = {
        status: "error",
        message: error instanceof Error ? error.message : "Unable to reach the meow-team backend.",
        guidance: buildConnectionGuidance(backendBaseUrl),
        checkedAt: new Date().toISOString(),
      };
      this.state.error = formatBackendError(error);
    }

    this.postState();
  }

  private async loadSelectedThread(baseUrl: string): Promise<TeamThreadDetail | null> {
    if (!this.state.selectedThreadId) {
      return null;
    }

    try {
      return await getThreadDetail(baseUrl, this.state.selectedThreadId);
    } catch (error) {
      if (error instanceof TeamApiError && error.status === 404) {
        this.state.selectedThreadId = resolveSelectedThreadId(this.state.workspace, null);
        if (this.state.selectedThreadId) {
          return getThreadDetail(baseUrl, this.state.selectedThreadId);
        }

        return null;
      }

      throw error;
    }
  }

  private postState() {
    if (!this.view) {
      return;
    }

    void this.view.webview.postMessage({
      type: "state",
      state: this.state,
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.mediaRoot, "styles.css"));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.mediaRoot, "main.js"));

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
    />
    <link href="${stylesUri}" rel="stylesheet" />
    <title>Meow Team Workspace</title>
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private async handleWebviewMessage(rawMessage: unknown) {
    if (!isRecord(rawMessage) || typeof rawMessage.type !== "string") {
      return;
    }

    const message = rawMessage as WebviewRequestMessage;

    switch (message.type) {
      case "ready":
      case "refresh": {
        await this.refresh();
        return;
      }
      case "select-thread": {
        this.state.selectedThreadId = readThreadId(message.payload?.threadId) ?? null;
        this.state.notice = null;
        this.state.error = null;
        await this.refresh();
        return;
      }
      case "open-settings": {
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          `${CONFIG_SECTION}.${BACKEND_BASE_URL_SETTING}`,
        );
        return;
      }
      case "approve": {
        await this.withAction("approve", "Submitting approval", async () => {
          await approveLane(this.state.backendBaseUrl, message.payload);
          this.state.notice =
            message.payload.target === "pull_request"
              ? "Final approval recorded. The archive flow can continue."
              : "Proposal approval recorded. The coding-review queue can continue.";
          await this.refresh();
        });
        return;
      }
      case "feedback": {
        await this.withAction("feedback", "Submitting feedback", async () => {
          await submitFeedback(this.state.backendBaseUrl, {
            ...message.payload,
            scope: message.payload.scope as TeamHumanFeedbackScope,
          });
          this.state.notice =
            "Human feedback recorded. Planner replanning started for this request.";
          await this.refresh();
        });
        return;
      }
      case "run": {
        await this.withAction("run", "Starting planner run", async () => {
          const result = await runTeam(this.state.backendBaseUrl, message.payload, (event) => {
            this.handleRunProgress(event);
          });
          this.state.selectedThreadId = result.acceptedThreadId ?? result.result.threadId ?? null;
          this.state.notice = `Assignment ${result.result.assignmentNumber} updated for ${result.result.requestTitle}.`;
          await this.refresh();
        });
        return;
      }
    }
  }

  private handleRunProgress(event: TeamRunProgressEvent) {
    if (event.type === "accepted") {
      this.state.selectedThreadId = event.threadId;
    }

    this.state.action = {
      kind: "run",
      label: "Planner run in progress",
      detail: event.detail,
    };
    this.postState();
  }

  private async withAction(
    kind: NonNullable<ActionState>["kind"],
    label: string,
    work: () => Promise<void>,
  ) {
    this.state.action = {
      kind,
      label,
      detail: null,
    };
    this.state.error = null;
    this.postState();

    try {
      await work();
    } catch (error) {
      this.state.error = formatBackendError(error);
      this.state.notice = null;
      this.postState();
    } finally {
      this.state.action = null;
      this.postState();
    }
  }
}
