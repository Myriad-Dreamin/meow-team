"use client";

import CodeMirror, {
  type CodeMirrorChangeHandler,
  type CodeMirrorEditor,
} from "@/packages/codemirror";
import "@/packages/codemirror/addon/display/placeholder";
import { useEffect, useRef } from "react";

type ThreadCommandEditorProps = {
  ariaDescribedBy?: string;
  ariaLabel: string;
  disabled: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

const updateAttribute = (element: HTMLElement, name: string, value: string | undefined) => {
  if (value) {
    element.setAttribute(name, value);
    return;
  }

  element.removeAttribute(name);
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
  updateAttribute(wrapper, "aria-describedby", ariaDescribedBy);

  const input = editor.getTextArea();
  input.setAttribute("aria-label", ariaLabel);
  input.setAttribute("aria-disabled", disabled ? "true" : "false");
  updateAttribute(input, "aria-describedby", ariaDescribedBy);
};

export function ThreadCommandEditor({
  ariaDescribedBy,
  ariaLabel,
  disabled,
  onChange,
  placeholder,
  value,
}: ThreadCommandEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<CodeMirrorEditor | null>(null);
  const changeHandlerRef = useRef<CodeMirrorChangeHandler | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const placeholderRef = useRef(placeholder);
  const disabledRef = useRef(disabled);
  const ariaLabelRef = useRef(ariaLabel);
  const ariaDescribedByRef = useRef(ariaDescribedBy);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    valueRef.current = value;
    const editor = editorRef.current;
    if (!editor || editor.getValue() === value) {
      return;
    }

    editor.setValue(value);
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
    disabledRef.current = disabled;
    ariaLabelRef.current = ariaLabel;
    ariaDescribedByRef.current = ariaDescribedBy;

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.setOption("readOnly", disabled ? "nocursor" : false);
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

    try {
      const textarea = document.createElement("textarea");
      textarea.spellcheck = false;
      textarea.value = valueRef.current;
      hostElement.replaceChildren(textarea);

      const editor = CodeMirror.fromTextArea(textarea, {
        lineWrapping: true,
        placeholder: placeholderRef.current,
        readOnly: disabledRef.current ? "nocursor" : false,
        viewportMargin: Number.POSITIVE_INFINITY,
      });

      const handleChange: CodeMirrorChangeHandler = (instance) => {
        const nextValue = instance.getValue();
        if (nextValue !== valueRef.current) {
          onChangeRef.current(nextValue);
        }
      };

      editor.on("change", handleChange);
      editor.setSize("100%", "auto");
      syncEditorAttributes({
        ariaDescribedBy: ariaDescribedByRef.current,
        ariaLabel: ariaLabelRef.current,
        disabled: disabledRef.current,
        editor,
      });
      editor.refresh();

      editorRef.current = editor;
      changeHandlerRef.current = handleChange;
      rootElement.dataset.status = "ready";
    } catch {
      hostElement.replaceChildren();
      rootElement.dataset.status = "error";
    }

    return () => {
      const editor = editorRef.current;
      const handleChange = changeHandlerRef.current;

      if (editor && handleChange) {
        editor.off("change", handleChange);
        editor.toTextArea();
      }

      editorRef.current = null;
      changeHandlerRef.current = null;
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
