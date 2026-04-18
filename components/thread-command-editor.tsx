"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import {
  getThreadCommandAutocomplete,
  type ThreadCommandAutocompleteSuggestion,
} from "@/lib/team/thread-command";

type CodeMirrorModule = typeof import("codemirror");
type CodeMirrorEditor = import("codemirror").EditorFromTextArea;
type CodeMirrorEditorConfiguration = import("codemirror").EditorConfiguration;
type CodeMirrorHintResult = import("codemirror").Hint;

type ThreadCommandEditorProps = {
  ariaDescribedBy?: string;
  ariaLabel: string;
  disabled: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  proposalNumbers: number[];
  value: string;
};

const updateAttribute = (element: HTMLElement, name: string, value: string | undefined) => {
  if (value) {
    element.setAttribute(name, value);
    return;
  }

  element.removeAttribute(name);
};

const getEditorInput = (editor: CodeMirrorEditor): HTMLTextAreaElement => {
  return editor.getInputField();
};

const syncEditorAttributes = ({
  ariaDescribedBy,
  ariaLabel,
  disabled,
  editor,
}: {
  ariaDescribedBy?: string;
  ariaLabel: string;
  disabled: boolean;
  editor: CodeMirrorEditor;
}) => {
  const wrapper = editor.getWrapperElement();
  wrapper.setAttribute("role", "textbox");
  wrapper.setAttribute("aria-label", ariaLabel);
  wrapper.setAttribute("aria-disabled", disabled ? "true" : "false");
  wrapper.setAttribute("aria-multiline", "true");
  updateAttribute(wrapper, "aria-describedby", ariaDescribedBy);

  const input = getEditorInput(editor);
  input.setAttribute("aria-label", ariaLabel);
  input.setAttribute("aria-disabled", disabled ? "true" : "false");
  updateAttribute(input, "aria-describedby", ariaDescribedBy);

  const sourceTextArea = editor.getTextArea();
  sourceTextArea.setAttribute("aria-label", ariaLabel);
  sourceTextArea.setAttribute("aria-disabled", disabled ? "true" : "false");
  updateAttribute(sourceTextArea, "aria-describedby", ariaDescribedBy);
};

const renderAutocompleteSuggestion = (
  element: HTMLElement,
  suggestion: ThreadCommandAutocompleteSuggestion,
) => {
  element.classList.add("thread-command-hint-option");

  const label = element.ownerDocument.createElement("span");
  label.className = "thread-command-hint-label";
  label.textContent = suggestion.label;

  const detail = element.ownerDocument.createElement("span");
  detail.className = "thread-command-hint-detail";
  detail.textContent = suggestion.detail;

  element.replaceChildren(label, detail);
};

const resolveCodeMirrorRuntime = (module: CodeMirrorModule) => {
  return module.default ?? (module as unknown as CodeMirrorModule["default"]);
};

const loadCodeMirror = async () => {
  const [codeMirrorModule] = await Promise.all([
    import("codemirror"),
    import("codemirror/addon/display/placeholder"),
    import("codemirror/addon/hint/show-hint"),
  ]);

  return resolveCodeMirrorRuntime(codeMirrorModule);
};

export function ThreadCommandEditor({
  ariaDescribedBy,
  ariaLabel,
  disabled,
  onChange,
  placeholder,
  proposalNumbers,
  value,
}: ThreadCommandEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<CodeMirrorEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const placeholderRef = useRef(placeholder);
  const disabledRef = useRef(disabled);
  const proposalNumbersRef = useRef(proposalNumbers);
  const ariaLabelRef = useRef(ariaLabel);
  const ariaDescribedByRef = useRef(ariaDescribedBy);
  const applyingExternalValueRef = useRef(false);

  const showAutocomplete = useEffectEvent((editor: CodeMirrorEditor) => {
    if (disabledRef.current) {
      return;
    }

    editor.showHint({
      completeSingle: false,
      hint(instance): CodeMirrorHintResult | null {
        const cursor = instance.getCursor();
        const completion = getThreadCommandAutocomplete({
          cursorIndex: instance.indexFromPos(cursor),
          proposalNumbers: proposalNumbersRef.current,
          value: instance.getValue(),
        });
        if (!completion || completion.suggestions.length === 0) {
          return null;
        }

        return {
          from: instance.posFromIndex(completion.from),
          list: completion.suggestions.map((suggestion) => ({
            render: (element: HTMLElement) => renderAutocompleteSuggestion(element, suggestion),
            text: suggestion.insertText,
          })),
          to: instance.posFromIndex(completion.to),
        };
      },
    });
  });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    valueRef.current = value;
    const editor = editorRef.current;
    if (!editor || editor.getValue() === value) {
      return;
    }

    applyingExternalValueRef.current = true;
    editor.setValue(value);
    applyingExternalValueRef.current = false;
  }, [value]);

  useEffect(() => {
    placeholderRef.current = placeholder;
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.setOption("placeholder", placeholder);
  }, [placeholder]);

  useEffect(() => {
    proposalNumbersRef.current = proposalNumbers;
  }, [proposalNumbers]);

  useEffect(() => {
    disabledRef.current = disabled;
    ariaLabelRef.current = ariaLabel;
    ariaDescribedByRef.current = ariaDescribedBy;

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.setOption("readOnly", disabled ? "nocursor" : false);
    editor.setOption("screenReaderLabel", ariaLabel);
    syncEditorAttributes({
      ariaDescribedBy,
      ariaLabel,
      disabled,
      editor,
    });
  }, [ariaDescribedBy, ariaLabel, disabled]);

  useEffect(() => {
    const rootElement = rootRef.current;
    const hostElement = hostRef.current;

    if (!rootElement || !hostElement) {
      return;
    }

    let isCancelled = false;
    let createdEditor: CodeMirrorEditor | null = null;
    let changeHandler: ((instance: CodeMirrorEditor) => void) | null = null;
    let focusHandler: ((instance: CodeMirrorEditor) => void) | null = null;

    const initialize = async () => {
      const textarea = document.createElement("textarea");
      textarea.spellcheck = false;
      textarea.value = valueRef.current;
      hostElement.replaceChildren(textarea);

      try {
        const CodeMirror = await loadCodeMirror();
        if (isCancelled) {
          hostElement.replaceChildren();
          return;
        }

        const options: CodeMirrorEditorConfiguration = {
          lineWrapping: true,
          placeholder: placeholderRef.current,
          readOnly: disabledRef.current ? "nocursor" : false,
          screenReaderLabel: ariaLabelRef.current,
          viewportMargin: Number.POSITIVE_INFINITY,
        };
        const editor = CodeMirror.fromTextArea(textarea, options);

        changeHandler = (instance) => {
          const nextValue = instance.getValue();
          if (nextValue === valueRef.current) {
            return;
          }

          valueRef.current = nextValue;
          if (!applyingExternalValueRef.current) {
            onChangeRef.current(nextValue);
            showAutocomplete(instance);
          }
        };
        focusHandler = (instance) => {
          showAutocomplete(instance);
        };

        editor.on("change", changeHandler);
        editor.on("focus", focusHandler);
        editor.setSize("100%", "auto");
        syncEditorAttributes({
          ariaDescribedBy: ariaDescribedByRef.current,
          ariaLabel: ariaLabelRef.current,
          disabled: disabledRef.current,
          editor,
        });
        editor.refresh();

        if (isCancelled) {
          editor.off("change", changeHandler);
          editor.off("focus", focusHandler);
          editor.toTextArea();
          hostElement.replaceChildren();
          return;
        }

        createdEditor = editor;
        editorRef.current = editor;
        rootElement.dataset.status = "ready";
      } catch {
        hostElement.replaceChildren();
        rootElement.dataset.status = "error";
      }
    };

    void initialize();

    return () => {
      isCancelled = true;

      if (createdEditor && changeHandler && focusHandler) {
        createdEditor.off("change", changeHandler);
        createdEditor.off("focus", focusHandler);
        createdEditor.toTextArea();
      }

      editorRef.current = null;
      hostElement.replaceChildren();
      rootElement.dataset.status = "loading";
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="thread-command-editor"
      data-disabled={disabled ? "true" : "false"}
      data-has-content={value.length > 0 ? "true" : "false"}
      data-placeholder={placeholder}
      data-status="loading"
      data-thread-command-editor="codemirror"
    >
      <div ref={hostRef} className="thread-command-editor-shell" />
    </div>
  );
}
