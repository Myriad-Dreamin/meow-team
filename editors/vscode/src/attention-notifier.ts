import type * as vscode from "vscode";
import {
  BACKEND_BASE_URL_SETTING,
  CONFIG_SECTION,
  DEFAULT_BACKEND_BASE_URL,
  OPEN_WORKSPACE_COMMAND,
  WORKSPACE_POLL_INTERVAL_MS,
} from "./constants";
import { getNotifications, normalizeBackendBaseUrl } from "./team-client";
import type { TeamAttentionNotification } from "./models";

const DELIVERED_FINGERPRINTS_STORAGE_KEY = "meowTeam.vscodeAttention.delivered";
const MAX_STORED_ATTENTION_FINGERPRINTS = 64;
const OPEN_WORKSPACE_ACTION = "Open Workspace";

type MinimalCommandsApi = Pick<typeof vscode.commands, "executeCommand">;

type MinimalWindowApi = {
  showErrorMessage: (message: string, ...items: string[]) => PromiseLike<string | undefined>;
  showWarningMessage: (message: string, ...items: string[]) => PromiseLike<string | undefined>;
};

type MinimalWorkspaceApi = Pick<typeof vscode.workspace, "getConfiguration">;
type MinimalMemento = Pick<vscode.Memento, "get" | "update">;

type MinimalNotificationApi = {
  commands: MinimalCommandsApi;
  window: MinimalWindowApi;
  workspace: MinimalWorkspaceApi;
};

const mergeStoredFingerprints = (
  storedFingerprints: Iterable<string>,
  nextFingerprints: Iterable<string>,
): string[] =>
  Array.from(new Set([...storedFingerprints, ...nextFingerprints])).slice(
    -MAX_STORED_ATTENTION_FINGERPRINTS,
  );

const readStoredFingerprints = (state: MinimalMemento): Set<string> => {
  const stored = state.get<string[]>(DELIVERED_FINGERPRINTS_STORAGE_KEY, []);
  return new Set(Array.isArray(stored) ? stored.filter((entry) => typeof entry === "string") : []);
};

const formatNotificationMessage = (notification: TeamAttentionNotification): string => {
  return `${notification.title}: ${notification.body}`;
};

export interface AttentionNotifier extends vscode.Disposable {
  handleConfigurationChange(): void;
  refresh(): Promise<void>;
  start(): void;
}

export class VscodeAttentionNotifier implements AttentionNotifier {
  private deliveredFingerprints: Set<string>;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    private readonly state: MinimalMemento,
    private readonly api: MinimalNotificationApi,
  ) {
    this.deliveredFingerprints = readStoredFingerprints(state);
  }

  start() {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.refresh();
    }, WORKSPACE_POLL_INTERVAL_MS);
    void this.refresh();
  }

  dispose() {
    if (!this.pollTimer) {
      return;
    }

    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  handleConfigurationChange() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh()
      .catch(() => undefined)
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  private readBackendBaseUrl(): string | null {
    const configuration = this.api.workspace.getConfiguration(CONFIG_SECTION);
    const configuredValue = configuration.get<string>(
      BACKEND_BASE_URL_SETTING,
      DEFAULT_BACKEND_BASE_URL,
    );

    try {
      return normalizeBackendBaseUrl(configuredValue);
    } catch {
      return null;
    }
  }

  private async performRefresh() {
    const backendBaseUrl = this.readBackendBaseUrl();
    if (!backendBaseUrl) {
      return;
    }

    const notificationSnapshot = await getNotifications(backendBaseUrl);
    if (notificationSnapshot.target !== "vscode") {
      return;
    }

    const deliveredFingerprintsThisPass: string[] = [];

    for (const notification of notificationSnapshot.notifications) {
      if (this.deliveredFingerprints.has(notification.fingerprint)) {
        continue;
      }

      await this.deliverNotification(notification);
      deliveredFingerprintsThisPass.push(notification.fingerprint);
    }

    if (deliveredFingerprintsThisPass.length === 0) {
      return;
    }

    this.deliveredFingerprints = new Set(
      mergeStoredFingerprints(this.deliveredFingerprints, deliveredFingerprintsThisPass),
    );
    await this.state.update(
      DELIVERED_FINGERPRINTS_STORAGE_KEY,
      Array.from(this.deliveredFingerprints),
    );
  }

  private async deliverNotification(notification: TeamAttentionNotification) {
    const message = formatNotificationMessage(notification);
    const selectedAction =
      notification.reason === "awaiting_human_approval"
        ? await this.api.window.showWarningMessage(message, OPEN_WORKSPACE_ACTION)
        : await this.api.window.showErrorMessage(message, OPEN_WORKSPACE_ACTION);

    if (selectedAction !== OPEN_WORKSPACE_ACTION) {
      return;
    }

    try {
      await this.api.commands.executeCommand(OPEN_WORKSPACE_COMMAND);
    } catch {
      // Ignore follow-up command failures after the user already saw the alert.
    }
  }
}

export const createVscodeAttentionNotifier = (
  context: Pick<vscode.ExtensionContext, "globalState">,
  api: MinimalNotificationApi,
): AttentionNotifier => {
  return new VscodeAttentionNotifier(context.globalState, api);
};
