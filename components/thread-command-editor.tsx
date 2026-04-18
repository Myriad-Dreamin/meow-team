"use client";

import { useEffect, useRef, useState } from "react";

const CODEMIRROR_CSS_ID = "thread-command-editor-codemirror-css";
const CODEMIRROR_CSS_URL = "https://codemirror.net/5/lib/codemirror.css";
const CODEMIRROR_SCRIPT_URL = "https://codemirror.net/5/lib/codemirror.js";
const CODEMIRROR_PLACEHOLDER_SCRIPT_URL = "https://codemirror.net/5/addon/display/placeholder.js";

type ThreadCommandEditorProps = {
  ariaDescribedBy?: string;
  ariaLabel: string;
  disabled: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

type CodeMirrorReadOnly = boolean | "nocursor";

type CodeMirrorOptions = {
  lineWrapping?: boolean;
  placeholder?: string;
  readOnly?: CodeMirrorReadOnly;
  viewportMargin?: number;
};

type CodeMirrorChangeHandler = (instance: CodeMirrorEditor) => void;

type CodeMirrorEditor = {
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

type CodeMirrorConstructor = {
  fromTextArea(textarea: HTMLTextAreaElement, options: CodeMirrorOptions): CodeMirrorEditor;
};

declare global {
  interface Window {
    CodeMirror?: CodeMirrorConstructor;
  }
}

let codeMirrorPromise: Promise<CodeMirrorConstructor> | null = null;

const ensureStylesheet = () => {
  if (document.getElementById(CODEMIRROR_CSS_ID)) {
    return;
  }

  const stylesheet = document.createElement("link");
  stylesheet.id = CODEMIRROR_CSS_ID;
  stylesheet.rel = "stylesheet";
  stylesheet.href = CODEMIRROR_CSS_URL;
  document.head.appendChild(stylesheet);
};

const loadScript = (src: string): Promise<void> => {
  const selector = `script[data-thread-command-editor-src="${src}"]`;

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing instanceof HTMLScriptElement) {
      if (existing.dataset.threadCommandEditorLoaded === "true") {
        resolve();
        return;
      }

      const handleLoad = () => resolve();
      const handleError = () => reject(new Error(`Unable to load the editor runtime from ${src}.`));

      existing.addEventListener("load", handleLoad, { once: true });
      existing.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    script.dataset.threadCommandEditorSrc = src;

    script.addEventListener(
      "load",
      () => {
        script.dataset.threadCommandEditorLoaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        script.remove();
        reject(new Error(`Unable to load the editor runtime from ${src}.`));
      },
      { once: true },
    );

    document.head.appendChild(script);
  });
};

const loadCodeMirror = async (): Promise<CodeMirrorConstructor> => {
  ensureStylesheet();

  if (window.CodeMirror) {
    return window.CodeMirror;
  }

  if (!codeMirrorPromise) {
    codeMirrorPromise = (async () => {
      await loadScript(CODEMIRROR_SCRIPT_URL);
      await loadScript(CODEMIRROR_PLACEHOLDER_SCRIPT_URL);

      if (!window.CodeMirror) {
        throw new Error("Unable to initialize the CodeMirror runtime.");
      }

      return window.CodeMirror;
    })().catch((error) => {
      codeMirrorPromise = null;
      throw error;
    });
  }

  return codeMirrorPromise;
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
  const [runtimeStatus, setRuntimeStatus] = useState<"loading" | "ready" | "fallback">("loading");
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
    if (runtimeStatus !== "loading") {
      return;
    }

    let isActive = true;
    const hostElement = hostRef.current;

    if (!hostElement) {
      return;
    }

    const mount = async () => {
      try {
        const CodeMirror = await loadCodeMirror();
        if (!isActive) {
          return;
        }

        const textarea = document.createElement("textarea");
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
        setRuntimeStatus("ready");
      } catch {
        hostElement.replaceChildren();
        if (isActive) {
          setRuntimeStatus("fallback");
        }
      }
    };

    void mount();

    return () => {
      isActive = false;

      const editor = editorRef.current;
      const handleChange = changeHandlerRef.current;

      if (editor && handleChange) {
        editor.off("change", handleChange);
        editor.toTextArea();
      }

      editorRef.current = null;
      changeHandlerRef.current = null;
      hostElement.replaceChildren();
    };
  }, [runtimeStatus]);

  return (
    <div
      className="thread-command-editor"
      data-disabled={disabled ? "true" : "false"}
      data-has-content={value.length > 0 ? "true" : "false"}
      data-placeholder={placeholder}
      data-status={runtimeStatus}
      data-thread-command-editor="codemirror"
    >
      {runtimeStatus === "fallback" ? (
        <textarea
          aria-describedby={ariaDescribedBy}
          aria-label={ariaLabel}
          className="thread-command-editor-fallback"
          disabled={disabled}
          placeholder={placeholder}
          rows={4}
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div ref={hostRef} className="thread-command-editor-shell" />
      )}
    </div>
  );
}
