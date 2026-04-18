// This compatibility runtime keeps the thread editor buildable in offline lanes
// while the repository contract points at the upstream codemirror package.
const MIN_EDITOR_HEIGHT_PX = 96;

export type Position = {
  ch: number;
  line: number;
  sticky?: string | null;
};

export type EditorChange = {
  from: Position;
  origin?: string;
  removed: string[];
  text: string[];
  to: Position;
};

export type EditorChangeLinkedList = EditorChange & {
  next?: EditorChangeLinkedList;
};

export type HintCompletion = {
  className?: string;
  displayText?: string;
  hint?: (editor: Editor, self: HintCompletion, data: Hint) => void;
  render?: (element: HTMLElement, self: HintCompletion, data: Hint) => void;
  text: string;
};

export type Hint = {
  from: Position;
  list: Array<string | HintCompletion>;
  to: Position;
};

export type HintOptions = {
  completeSingle?: boolean;
  hint?: (editor: Editor, options: HintOptions) => Hint | null;
};

export type CodeMirrorReadOnly = boolean | "nocursor";

export type EditorConfiguration = {
  lineWrapping?: boolean;
  placeholder?: string;
  readOnly?: CodeMirrorReadOnly;
  screenReaderLabel?: string;
  viewportMargin?: number;
};

type ChangeHandler = (instance: EditorFromTextArea, change: EditorChangeLinkedList) => void;
type FocusHandler = (instance: EditorFromTextArea, event: FocusEvent) => void;

type HintState = {
  activeIndex: number;
  container: HTMLUListElement;
  hint: Hint;
  items: Array<string | HintCompletion>;
  keydownHandler: (event: KeyboardEvent) => void;
  pointerDownHandler: (event: PointerEvent) => void;
};

const normalizeValue = (value: string) => value.replace(/\r\n?/g, "\n");

const clamp = (value: number, minimum: number, maximum: number) => {
  return Math.min(Math.max(value, minimum), maximum);
};

const splitLines = (value: string) => {
  return normalizeValue(value).split("\n");
};

const posFromIndex = (value: string, index: number): Position => {
  const normalized = normalizeValue(value);
  const clampedIndex = clamp(index, 0, normalized.length);
  const beforeCursor = normalized.slice(0, clampedIndex);
  const lines = beforeCursor.split("\n");

  return {
    ch: lines.at(-1)?.length ?? 0,
    line: lines.length - 1,
  };
};

const indexFromPos = (value: string, position: Position): number => {
  const lines = splitLines(value);
  const lineIndex = clamp(position.line, 0, Math.max(lines.length - 1, 0));
  const linePrefixLength = lines
    .slice(0, lineIndex)
    .reduce((total, line) => total + line.length + 1, 0);
  const line = lines[lineIndex] ?? "";

  return linePrefixLength + clamp(position.ch, 0, line.length);
};

const createChange = (before: string, after: string): EditorChangeLinkedList => {
  let prefixLength = 0;
  while (
    prefixLength < before.length &&
    prefixLength < after.length &&
    before[prefixLength] === after[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < before.length - prefixLength &&
    suffixLength < after.length - prefixLength &&
    before[before.length - suffixLength - 1] === after[after.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const removed = before.slice(prefixLength, before.length - suffixLength);
  const inserted = after.slice(prefixLength, after.length - suffixLength);

  return {
    from: posFromIndex(before, prefixLength),
    removed: removed.length > 0 ? removed.split("\n") : [""],
    text: inserted.length > 0 ? inserted.split("\n") : [""],
    to: posFromIndex(before, before.length - suffixLength),
  };
};

class SimpleCodeMirrorEditor {
  private readonly changeHandlers = new Set<ChangeHandler>();
  private readonly focusHandlers = new Set<FocusHandler>();
  private readonly cursorLayer: HTMLDivElement;
  private hintState: HintState | null = null;
  private readonly input: HTMLTextAreaElement;
  private readonly linesElement: HTMLDivElement;
  private readonly placeholderElement: HTMLPreElement;
  private readonly scrollElement: HTMLDivElement;
  private readonly sizerElement: HTMLDivElement;
  private value: string;
  private readonly wrapper: HTMLDivElement;

  constructor(
    private readonly sourceTextArea: HTMLTextAreaElement,
    private options: Required<
      Pick<
        EditorConfiguration,
        "lineWrapping" | "placeholder" | "screenReaderLabel" | "viewportMargin"
      >
    > & {
      readOnly: CodeMirrorReadOnly;
    },
  ) {
    const document = sourceTextArea.ownerDocument;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "CodeMirror";

    this.scrollElement = document.createElement("div");
    this.scrollElement.className = "CodeMirror-scroll";

    this.sizerElement = document.createElement("div");
    this.sizerElement.className = "CodeMirror-sizer";

    this.linesElement = document.createElement("div");
    this.linesElement.className = "CodeMirror-lines";

    this.placeholderElement = document.createElement("pre");
    this.placeholderElement.className = "CodeMirror-placeholder";
    this.placeholderElement.setAttribute("aria-hidden", "true");

    this.input = document.createElement("textarea");
    this.input.rows = Math.max(sourceTextArea.rows, 4);
    this.input.spellcheck = sourceTextArea.spellcheck;
    this.input.wrap = this.options.lineWrapping ? "soft" : "off";
    this.input.addEventListener("input", this.handleInput);
    this.input.addEventListener("focus", this.handleFocus);

    this.linesElement.append(this.placeholderElement, this.input);
    this.sizerElement.append(this.linesElement);
    this.scrollElement.append(this.sizerElement);
    this.wrapper.append(this.scrollElement);

    this.cursorLayer = document.createElement("div");
    this.cursorLayer.className = "CodeMirror-cursors";
    this.wrapper.append(this.cursorLayer);

    this.value = normalizeValue(sourceTextArea.value);
    sourceTextArea.hidden = true;
    sourceTextArea.setAttribute("aria-hidden", "true");
    sourceTextArea.after(this.wrapper);

    this.setOption("placeholder", this.options.placeholder);
    this.setOption("readOnly", this.options.readOnly);
    this.setOption("screenReaderLabel", this.options.screenReaderLabel);
    this.setValue(this.value);
  }

  getCursor(): Position {
    return posFromIndex(this.value, this.input.selectionStart ?? this.value.length);
  }

  getInputField() {
    return this.input;
  }

  getTextArea() {
    return this.sourceTextArea;
  }

  getValue() {
    return this.value;
  }

  getWrapperElement() {
    return this.wrapper;
  }

  indexFromPos(position: Position) {
    return indexFromPos(this.value, position);
  }

  off(event: "change" | "focus", handler: ChangeHandler | FocusHandler) {
    if (event === "change") {
      this.changeHandlers.delete(handler as ChangeHandler);
      return;
    }

    this.focusHandlers.delete(handler as FocusHandler);
  }

  on(event: "change" | "focus", handler: ChangeHandler | FocusHandler) {
    if (event === "change") {
      this.changeHandlers.add(handler as ChangeHandler);
      return;
    }

    this.focusHandlers.add(handler as FocusHandler);
  }

  posFromIndex(index: number) {
    return posFromIndex(this.value, index);
  }

  refresh() {
    this.resizeToContent();
    this.positionHintContainer();
  }

  setOption(
    name: "placeholder" | "readOnly" | "screenReaderLabel",
    value: string | CodeMirrorReadOnly,
  ) {
    if (name === "placeholder") {
      this.options = {
        ...this.options,
        placeholder: typeof value === "string" ? value : "",
      };
      this.syncPlaceholder();
      return;
    }

    if (name === "screenReaderLabel") {
      const screenReaderLabel = typeof value === "string" ? value : "";
      this.options = {
        ...this.options,
        screenReaderLabel,
      };
      this.input.setAttribute("aria-label", screenReaderLabel);
      return;
    }

    const readOnly = value === true || value === "nocursor";
    this.options = {
      ...this.options,
      readOnly: value as CodeMirrorReadOnly,
    };
    this.input.readOnly = readOnly;
    this.input.tabIndex = value === "nocursor" ? -1 : 0;
    this.input.setAttribute("aria-readonly", readOnly ? "true" : "false");
    this.wrapper.dataset.readOnly = readOnly ? "true" : "false";
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

    this.positionHintContainer();
  }

  setValue(value: string) {
    this.value = normalizeValue(value);
    this.sourceTextArea.value = this.value;
    this.input.value = this.value;
    this.syncPlaceholder();
    this.resizeToContent();
    this.closeHint();
  }

  showHint(options: HintOptions = {}) {
    if (this.options.readOnly === true || this.options.readOnly === "nocursor") {
      return;
    }

    this.closeHint();

    const hint = options.hint?.(this as EditorFromTextArea, options) ?? null;
    if (!hint || hint.list.length === 0) {
      return;
    }

    const document = this.input.ownerDocument;
    const container = document.createElement("ul");
    container.className = "CodeMirror-hints";
    container.setAttribute("role", "listbox");

    const keydownHandler = (event: KeyboardEvent) => {
      if (!this.hintState) {
        return;
      }

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          this.setActiveHint(this.hintState.activeIndex + 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          this.setActiveHint(this.hintState.activeIndex - 1);
          break;
        case "Enter":
        case "Tab":
          event.preventDefault();
          this.applyHint(this.hintState.activeIndex);
          break;
        case "Escape":
          event.preventDefault();
          this.closeHint();
          break;
        default:
          break;
      }
    };

    const pointerDownHandler = (event: PointerEvent) => {
      if (
        !container.contains(event.target as Node) &&
        !this.wrapper.contains(event.target as Node)
      ) {
        this.closeHint();
      }
    };

    hint.list.forEach((completion, index) => {
      const item = document.createElement("li");
      item.className = "CodeMirror-hint";
      item.setAttribute("role", "option");

      if (typeof completion === "string") {
        item.textContent = completion;
      } else if (completion.render) {
        completion.render(item, completion, hint);
      } else {
        item.textContent = completion.displayText ?? completion.text;
      }

      if (typeof completion !== "string" && completion.className) {
        item.classList.add(completion.className);
      }

      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.applyHint(index);
      });

      container.append(item);
    });

    document.body.append(container);
    this.hintState = {
      activeIndex: 0,
      container,
      hint,
      items: hint.list,
      keydownHandler,
      pointerDownHandler,
    };
    this.input.addEventListener("keydown", keydownHandler);
    document.addEventListener("pointerdown", pointerDownHandler);
    this.setActiveHint(0);
    this.positionHintContainer();
  }

  toTextArea() {
    this.closeHint();
    this.input.removeEventListener("input", this.handleInput);
    this.input.removeEventListener("focus", this.handleFocus);
    this.sourceTextArea.hidden = false;
    this.sourceTextArea.removeAttribute("aria-hidden");
    this.sourceTextArea.value = this.value;
    this.wrapper.remove();
  }

  private readonly applyHint = (index: number) => {
    if (!this.hintState) {
      return;
    }

    const completion = this.hintState.items[index];
    if (!completion) {
      return;
    }

    if (typeof completion !== "string" && completion.hint) {
      completion.hint(this as EditorFromTextArea, completion, this.hintState.hint);
      this.closeHint();
      return;
    }

    const text = typeof completion === "string" ? completion : completion.text;
    const from = this.indexFromPos(this.hintState.hint.from);
    const to = this.indexFromPos(this.hintState.hint.to);
    const previousValue = this.value;
    const nextValue = `${previousValue.slice(0, from)}${text}${previousValue.slice(to)}`;

    this.input.focus();
    this.setValue(nextValue);
    const nextCursorIndex = from + text.length;
    this.input.selectionStart = nextCursorIndex;
    this.input.selectionEnd = nextCursorIndex;
    this.emitChange(createChange(previousValue, nextValue));
    this.closeHint();
  };

  private closeHint() {
    if (!this.hintState) {
      return;
    }

    this.hintState.container.remove();
    this.input.removeEventListener("keydown", this.hintState.keydownHandler);
    this.input.ownerDocument.removeEventListener("pointerdown", this.hintState.pointerDownHandler);
    this.hintState = null;
  }

  private emitChange(change: EditorChangeLinkedList) {
    for (const handler of this.changeHandlers) {
      handler(this as EditorFromTextArea, change);
    }
  }

  private readonly handleFocus = (event: FocusEvent) => {
    for (const handler of this.focusHandlers) {
      handler(this as EditorFromTextArea, event);
    }
  };

  private readonly handleInput = () => {
    const previousValue = this.value;
    const nextValue = normalizeValue(this.input.value);
    if (nextValue === previousValue) {
      this.resizeToContent();
      this.syncPlaceholder();
      return;
    }

    this.closeHint();
    this.value = nextValue;
    this.sourceTextArea.value = nextValue;
    this.syncPlaceholder();
    this.resizeToContent();
    this.emitChange(createChange(previousValue, nextValue));
  };

  private positionHintContainer() {
    if (!this.hintState) {
      return;
    }

    const rect = this.wrapper.getBoundingClientRect();
    this.hintState.container.style.position = "absolute";
    this.hintState.container.style.left = `${rect.left + window.scrollX}px`;
    this.hintState.container.style.top = `${rect.bottom + window.scrollY + 8}px`;
  }

  private resizeToContent() {
    this.input.style.height = "0px";
    const nextHeight = Math.max(this.input.scrollHeight, MIN_EDITOR_HEIGHT_PX);
    this.input.style.height = `${nextHeight}px`;
    this.scrollElement.style.minHeight = `${nextHeight}px`;
    this.sizerElement.style.minHeight = `${nextHeight}px`;
    this.linesElement.style.minHeight = `${nextHeight}px`;
    this.positionHintContainer();
  }

  private setActiveHint(nextIndex: number) {
    if (!this.hintState) {
      return;
    }

    const itemCount = this.hintState.items.length;
    if (itemCount === 0) {
      return;
    }

    const normalizedIndex = ((nextIndex % itemCount) + itemCount) % itemCount;
    this.hintState.activeIndex = normalizedIndex;

    Array.from(this.hintState.container.children).forEach((child, index) => {
      child.classList.toggle("CodeMirror-hint-active", index === normalizedIndex);
      if (index === normalizedIndex) {
        child.scrollIntoView({
          block: "nearest",
        });
      }
    });
  }

  private syncPlaceholder() {
    const hasContent = this.value.length > 0;
    this.wrapper.dataset.hasContent = hasContent ? "true" : "false";
    this.placeholderElement.hidden = hasContent;
    this.placeholderElement.textContent = this.options.placeholder;
  }
}

export type Editor = SimpleCodeMirrorEditor;
export type EditorFromTextArea = SimpleCodeMirrorEditor;

const CodeMirror = {
  fromTextArea(
    textarea: HTMLTextAreaElement,
    options: EditorConfiguration = {},
  ): EditorFromTextArea {
    return new SimpleCodeMirrorEditor(textarea, {
      lineWrapping: options.lineWrapping ?? true,
      placeholder: options.placeholder ?? "",
      readOnly: options.readOnly ?? false,
      screenReaderLabel: options.screenReaderLabel ?? "",
      viewportMargin: options.viewportMargin ?? Number.POSITIVE_INFINITY,
    }) as EditorFromTextArea;
  },
};

export default CodeMirror;
