declare module "vscode" {
  export interface Disposable {
    dispose(): unknown;
  }

  export type Thenable<T> = PromiseLike<T>;

  export interface ExtensionContext {
    extensionUri: Uri;
    subscriptions: {
      push(...items: Disposable[]): number;
    };
  }

  export interface ConfigurationChangeEvent {
    affectsConfiguration(section: string): boolean;
  }

  export interface WorkspaceConfiguration {
    get<T>(section: string, defaultValue?: T): T;
  }

  export namespace workspace {
    function getConfiguration(section?: string): WorkspaceConfiguration;
    function onDidChangeConfiguration(
      listener: (event: ConfigurationChangeEvent) => unknown,
    ): Disposable;
  }

  export namespace commands {
    function executeCommand<T = unknown>(command: string, ...args: unknown[]): Thenable<T>;
    function registerCommand(
      command: string,
      callback: (...args: unknown[]) => unknown,
    ): Disposable;
  }

  export interface WebviewOptions {
    enableScripts?: boolean;
    localResourceRoots?: readonly Uri[];
  }

  export interface Webview {
    html: string;
    options: WebviewOptions;
    cspSource: string;
    postMessage(message: unknown): Thenable<boolean>;
    onDidReceiveMessage(listener: (message: unknown) => unknown): Disposable;
    asWebviewUri(uri: Uri): Uri;
  }

  export interface WebviewView {
    readonly visible: boolean;
    readonly webview: Webview;
    onDidDispose(listener: () => unknown): Disposable;
    onDidChangeVisibility(listener: () => unknown): Disposable;
  }

  export interface WebviewViewProvider {
    resolveWebviewView(webviewView: WebviewView): void | Thenable<void>;
  }

  export namespace window {
    function registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable;
  }

  export class Uri {
    static joinPath(base: Uri, ...pathSegments: string[]): Uri;
    static parse(value: string): Uri;
    toString(skipEncoding?: boolean): string;
  }
}
