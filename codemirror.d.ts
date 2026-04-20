declare module "codemirror" {
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
    hint?: (editor: EditorFromTextArea, self: HintCompletion, data: Hint) => void;
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
    hint?: (editor: EditorFromTextArea, options: HintOptions) => Hint | null;
  };

  export type CodeMirrorReadOnly = boolean | "nocursor";

  export type EditorConfiguration = {
    lineWrapping?: boolean;
    mode?: string;
    placeholder?: string;
    readOnly?: CodeMirrorReadOnly;
    screenReaderLabel?: string;
    viewportMargin?: number;
  };

  export interface Editor {
    getCursor(): Position;
    getInputField(): HTMLTextAreaElement;
    getTextArea(): HTMLTextAreaElement;
    getValue(): string;
    getWrapperElement(): HTMLDivElement;
    indexFromPos(position: Position): number;
    off(
      event: "change",
      handler: (instance: EditorFromTextArea, change: EditorChangeLinkedList) => void,
    ): void;
    off(event: "focus", handler: (instance: EditorFromTextArea, event: FocusEvent) => void): void;
    on(
      event: "change",
      handler: (instance: EditorFromTextArea, change: EditorChangeLinkedList) => void,
    ): void;
    on(event: "focus", handler: (instance: EditorFromTextArea, event: FocusEvent) => void): void;
    posFromIndex(index: number): Position;
    refresh(): void;
    setOption(name: "placeholder" | "screenReaderLabel", value: string): void;
    setOption(name: "readOnly", value: CodeMirrorReadOnly): void;
    setSize(width: string | number, height: string | number): void;
    setValue(value: string): void;
    showHint(options?: HintOptions): void;
    toTextArea(): void;
  }

  export type EditorFromTextArea = Editor;

  export interface CodeMirror {
    fromTextArea(textArea: HTMLTextAreaElement, options?: EditorConfiguration): EditorFromTextArea;
  }

  const codeMirror: CodeMirror;

  export default codeMirror;
}

declare module "codemirror/addon/display/placeholder" {
  const placeholderAddon: undefined;

  export default placeholderAddon;
}

declare module "codemirror/addon/hint/show-hint" {
  const showHintAddon: undefined;

  export default showHintAddon;
}

declare module "codemirror/mode/markdown/markdown" {
  const markdownMode: undefined;

  export default markdownMode;
}
