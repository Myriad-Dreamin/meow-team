export class Uri {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  static joinPath(base: Uri, ...pathSegments: string[]) {
    const normalizedBase = base.toString().replace(/\/+$/, "");
    const normalizedPath = pathSegments.map((segment) => segment.replace(/^\/+|\/+$/g, ""));
    return new Uri([normalizedBase, ...normalizedPath].join("/"));
  }

  static parse(value: string) {
    return new Uri(value);
  }

  toString() {
    return this.value;
  }
}

const disposable = () => ({
  dispose() {
    return undefined;
  },
});

export const commands = {
  async executeCommand() {
    return undefined;
  },
  registerCommand() {
    return disposable();
  },
};

export const window = {
  registerWebviewViewProvider() {
    return disposable();
  },
};

export const workspace = {
  getConfiguration() {
    return {
      get<T>(_section: string, defaultValue?: T) {
        return defaultValue as T;
      },
    };
  },
  onDidChangeConfiguration() {
    return disposable();
  },
};
