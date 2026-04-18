const MIN_EDITOR_HEIGHT_PX = 96;

export type CodeMirrorReadOnly = boolean | "nocursor";

export type CodeMirrorOptions = {
  lineWrapping?: boolean;
  placeholder?: string;
  readOnly?: CodeMirrorReadOnly;
  viewportMargin?: number;
};

export type CodeMirrorChangeHandler = (instance: CodeMirrorEditor) => void;

export type CodeMirrorEditor = {
  getTextArea(): HTMLTextAreaElement;
  getValue(): string;
  getWrapperElement(): HTMLElement;
  off(event: "change", handler: CodeMirrorChangeHandler): void;
  on(event: "change", handler: CodeMirrorChangeHandler): void;
  refresh(): void;
  setOption(name: "placeholder" | "readOnly", value: string | CodeMirrorReadOnly): void;
  setSize(width: string | null, height: string | null): void;
  setValue(value: string): void;
  toTextArea(): void;
};

const normalizeValue = (value: string) => value.replace(/\r\n?/g, "\n");

class SimpleCodeMirrorEditor implements CodeMirrorEditor {
  private readonly changeHandlers = new Set<CodeMirrorChangeHandler>();
  private readonly input: HTMLTextAreaElement;
  private readonly placeholderElement: HTMLSpanElement;
  private readonly scrollElement: HTMLDivElement;
  private readonly wrapper: HTMLDivElement;
  private value: string;

  constructor(
    private readonly sourceTextArea: HTMLTextAreaElement,
    private options: Required<
      Pick<CodeMirrorOptions, "lineWrapping" | "placeholder" | "viewportMargin">
    > & {
      readOnly: CodeMirrorReadOnly;
    },
  ) {
    const document = sourceTextArea.ownerDocument;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "CodeMirror";

    this.scrollElement = document.createElement("div");
    this.scrollElement.className = "CodeMirror-scroll";

    const linesElement = document.createElement("div");
    linesElement.className = "CodeMirror-lines";

    this.placeholderElement = document.createElement("span");
    this.placeholderElement.className = "CodeMirror-placeholder";
    this.placeholderElement.setAttribute("aria-hidden", "true");

    this.input = document.createElement("textarea");
    this.input.className = "CodeMirror-input";
    this.input.rows = Math.max(sourceTextArea.rows, 4);
    this.input.spellcheck = sourceTextArea.spellcheck;
    this.input.wrap = this.options.lineWrapping ? "soft" : "off";
    this.input.addEventListener("input", this.handleInput);

    linesElement.append(this.placeholderElement, this.input);
    this.scrollElement.append(linesElement);
    this.wrapper.append(this.scrollElement);

    const cursorsElement = document.createElement("div");
    cursorsElement.className = "CodeMirror-cursors";
    this.wrapper.append(cursorsElement);

    this.value = normalizeValue(sourceTextArea.value);
    sourceTextArea.hidden = true;
    sourceTextArea.setAttribute("aria-hidden", "true");
    sourceTextArea.after(this.wrapper);

    this.setOption("placeholder", this.options.placeholder);
    this.setOption("readOnly", this.options.readOnly);
    this.setValue(this.value);
  }

  getTextArea() {
    return this.input;
  }

  getValue() {
    return this.value;
  }

  getWrapperElement() {
    return this.wrapper;
  }

  off(event: "change", handler: CodeMirrorChangeHandler) {
    if (event === "change") {
      this.changeHandlers.delete(handler);
    }
  }

  on(event: "change", handler: CodeMirrorChangeHandler) {
    if (event === "change") {
      this.changeHandlers.add(handler);
    }
  }

  refresh() {
    this.resizeToContent();
  }

  setOption(name: "placeholder" | "readOnly", value: string | CodeMirrorReadOnly) {
    if (name === "placeholder") {
      this.options = {
        ...this.options,
        placeholder: typeof value === "string" ? value : "",
      };
      this.syncPlaceholder();
      return;
    }

    const readOnly = value === true || value === "nocursor";
    this.options = {
      ...this.options,
      readOnly: value as CodeMirrorReadOnly,
    };
    this.input.readOnly = readOnly;
    this.input.tabIndex = value === "nocursor" ? -1 : 0;
    this.wrapper.dataset.readOnly = readOnly ? "true" : "false";
    this.input.setAttribute("aria-readonly", readOnly ? "true" : "false");
  }

  setSize(width: string | null, height: string | null) {
    if (width !== null) {
      this.wrapper.style.width = width;
    }

    if (height !== null) {
      this.wrapper.style.height = height;
      this.scrollElement.style.minHeight = height;
      this.input.style.minHeight = height;
    }
  }

  setValue(value: string) {
    this.value = normalizeValue(value);
    this.sourceTextArea.value = this.value;
    this.input.value = this.value;
    this.syncPlaceholder();
    this.resizeToContent();
  }

  toTextArea() {
    this.input.removeEventListener("input", this.handleInput);
    this.sourceTextArea.hidden = false;
    this.sourceTextArea.removeAttribute("aria-hidden");
    this.sourceTextArea.value = this.value;
    this.wrapper.remove();
  }

  private readonly handleInput = () => {
    const nextValue = normalizeValue(this.input.value);
    if (nextValue === this.value) {
      this.resizeToContent();
      this.syncPlaceholder();
      return;
    }

    this.value = nextValue;
    this.sourceTextArea.value = nextValue;
    this.syncPlaceholder();
    this.resizeToContent();

    for (const handler of this.changeHandlers) {
      handler(this);
    }
  };

  private resizeToContent() {
    this.input.style.height = "0px";
    const nextHeight = Math.max(this.input.scrollHeight, MIN_EDITOR_HEIGHT_PX);
    this.input.style.height = `${nextHeight}px`;
    this.scrollElement.style.minHeight = `${nextHeight}px`;
  }

  private syncPlaceholder() {
    const hasContent = this.value.length > 0;
    this.wrapper.dataset.hasContent = hasContent ? "true" : "false";
    this.placeholderElement.hidden = hasContent;
    this.placeholderElement.textContent = this.options.placeholder;
  }
}

const CodeMirror = {
  fromTextArea(textarea: HTMLTextAreaElement, options: CodeMirrorOptions = {}): CodeMirrorEditor {
    return new SimpleCodeMirrorEditor(textarea, {
      lineWrapping: options.lineWrapping ?? true,
      placeholder: options.placeholder ?? "",
      readOnly: options.readOnly ?? false,
      viewportMargin: options.viewportMargin ?? Number.POSITIVE_INFINITY,
    });
  },
};

export default CodeMirror;
