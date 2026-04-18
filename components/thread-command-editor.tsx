"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  applyThreadCommandAutocomplete,
  getThreadCommandAutocompleteMatches,
  type ThreadCommandAutocompleteMatchResult,
} from "@/lib/team/thread-command-autocomplete";
import { type ThreadCommandDefinition } from "@/lib/team/thread-command";
import CodeMirror, {
  type CodeMirrorChangeHandler,
  type CodeMirrorEditor,
} from "@/packages/codemirror";
import "@/packages/codemirror/addon/display/placeholder";

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
  const [autocomplete, setAutocomplete] = useState<ThreadCommandAutocompleteMatchResult | null>(
    null,
  );
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null);
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
  const autocompleteRef = useRef<ThreadCommandAutocompleteMatchResult | null>(null);
  const selectedCommandRef = useRef<string | null>(null);

  const updateAutocomplete = (nextValue: ThreadCommandAutocompleteMatchResult | null) => {
    autocompleteRef.current = nextValue;
    setAutocomplete(nextValue);
  };

  const updateSelectedCommand = (nextValue: string | null) => {
    selectedCommandRef.current = nextValue;
    setSelectedCommand(nextValue);
  };

  const dismissAutocomplete = () => {
    updateAutocomplete(null);
    updateSelectedCommand(null);
  };

  const dismissAutocompleteFromEffect = useEffectEvent(() => {
    dismissAutocomplete();
  });

  const syncAutocomplete = useEffectEvent((
    nextValue: string,
    selectionStart: number | null,
    selectionEnd: number | null,
  ) => {
    if (disabledRef.current || selectionStart === null || selectionEnd === null) {
      dismissAutocomplete();
      return;
    }

    const nextAutocomplete = getThreadCommandAutocompleteMatches({
      selectionEnd,
      selectionStart,
      value: nextValue,
    });
    if (!nextAutocomplete) {
      dismissAutocomplete();
      return;
    }

    updateAutocomplete(nextAutocomplete);
    const nextSelectedCommand =
      selectedCommandRef.current &&
      nextAutocomplete.items.some((command) => command.command === selectedCommandRef.current)
        ? selectedCommandRef.current
        : nextAutocomplete.items[0]?.command ?? null;
    updateSelectedCommand(nextSelectedCommand);
  });

  const getSelectedCommandDefinition = useEffectEvent((): ThreadCommandDefinition | null => {
    const selectedCommandName = selectedCommandRef.current;
    if (!autocompleteRef.current) {
      return null;
    }

    return (
      autocompleteRef.current.items.find((command) => command.command === selectedCommandName) ??
      autocompleteRef.current.items[0] ??
      null
    );
  });

  const moveSelectedCommand = useEffectEvent((direction: 1 | -1) => {
    const items = autocompleteRef.current?.items ?? [];
    if (items.length === 0) {
      return;
    }

    const currentIndex = items.findIndex((command) => command.command === selectedCommandRef.current);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + items.length) % items.length;
    updateSelectedCommand(items[nextIndex]?.command ?? null);
  });

  const applySuggestion = (command: ThreadCommandDefinition) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const input = editor.getTextArea();
    const applied = applyThreadCommandAutocomplete({
      command,
      selectionEnd: input.selectionEnd ?? input.selectionStart ?? 0,
      selectionStart: input.selectionStart ?? 0,
      value: editor.getValue(),
    });
    if (!applied) {
      return;
    }

    valueRef.current = applied.value;
    editor.setValue(applied.value);
    input.focus();
    input.setSelectionRange(applied.selectionStart, applied.selectionEnd);
    dismissAutocomplete();
    onChangeRef.current(applied.value);
  };

  const acceptSuggestionFromEffect = useEffectEvent((command: ThreadCommandDefinition) => {
    applySuggestion(command);
  });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    valueRef.current = value;
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (editor.getValue() !== value) {
      editor.setValue(value);
      queueMicrotask(() => {
        if (editorRef.current !== editor) {
          return;
        }

        const input = editor.getTextArea();
        syncAutocomplete(value, input.selectionStart, input.selectionEnd);
      });
    }
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

    queueMicrotask(() => {
      if (editorRef.current !== editor) {
        return;
      }

      if (disabled) {
        dismissAutocompleteFromEffect();
        return;
      }

      const input = editor.getTextArea();
      syncAutocomplete(editor.getValue(), input.selectionStart, input.selectionEnd);
    });
  }, [ariaDescribedBy, ariaLabel, disabled]);

  useEffect(() => {
    editorRef.current?.refresh();
  }, [autocomplete]);

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

      const input = editor.getTextArea();
      const syncFromInput = () => {
        syncAutocomplete(editor.getValue(), input.selectionStart, input.selectionEnd);
      };

      const handleChange: CodeMirrorChangeHandler = (instance) => {
        const nextValue = instance.getValue();
        syncFromInput();
        if (nextValue !== valueRef.current) {
          onChangeRef.current(nextValue);
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (!autocompleteRef.current) {
          return;
        }

        switch (event.key) {
          case "ArrowDown":
            event.preventDefault();
            moveSelectedCommand(1);
            return;
          case "ArrowUp":
            event.preventDefault();
            moveSelectedCommand(-1);
            return;
          case "Tab":
          case "Enter": {
            const selected = getSelectedCommandDefinition();
            if (!selected) {
              return;
            }

            event.preventDefault();
            acceptSuggestionFromEffect(selected);
            return;
          }
          case "Escape":
            event.preventDefault();
            dismissAutocompleteFromEffect();
            return;
          default:
            return;
        }
      };

      const handleBlur = () => {
        dismissAutocompleteFromEffect();
      };

      input.addEventListener("blur", handleBlur);
      input.addEventListener("click", syncFromInput);
      input.addEventListener("focus", syncFromInput);
      input.addEventListener("keydown", handleKeyDown);
      input.addEventListener("keyup", syncFromInput);
      input.addEventListener("select", syncFromInput);
      editor.on("change", handleChange);
      editor.setSize("100%", "auto");
      syncEditorAttributes({
        ariaDescribedBy: ariaDescribedByRef.current,
        ariaLabel: ariaLabelRef.current,
        disabled: disabledRef.current,
        editor,
      });
      editor.refresh();
      syncFromInput();

      editorRef.current = editor;
      changeHandlerRef.current = handleChange;
      rootElement.dataset.status = "ready";

      return () => {
        input.removeEventListener("blur", handleBlur);
        input.removeEventListener("click", syncFromInput);
        input.removeEventListener("focus", syncFromInput);
        input.removeEventListener("keydown", handleKeyDown);
        input.removeEventListener("keyup", syncFromInput);
        input.removeEventListener("select", syncFromInput);
      };
    } catch {
      hostElement.replaceChildren();
      rootElement.dataset.status = "error";
    }

    return;
  }, []);

  useEffect(() => {
    const rootElement = rootRef.current;
    const hostElement = hostRef.current;

    return () => {
      const editor = editorRef.current;
      const handleChange = changeHandlerRef.current;

      if (editor && handleChange) {
        editor.off("change", handleChange);
        editor.toTextArea();
      }

      editorRef.current = null;
      changeHandlerRef.current = null;
      hostElement?.replaceChildren();
      if (rootElement) {
        rootElement.dataset.status = "loading";
      }
    };
  }, []);

  const suggestions = autocomplete?.items ?? [];

  return (
    <div
      ref={rootRef}
      className="thread-command-editor"
      data-autocomplete={suggestions.length > 0 ? "open" : "closed"}
      data-disabled={disabled ? "true" : "false"}
      data-has-content={value.length > 0 ? "true" : "false"}
      data-placeholder={placeholder}
      data-status="loading"
      data-thread-command-editor="codemirror"
    >
      <div ref={hostRef} className="thread-command-editor-shell" />
      {suggestions.length > 0 ? (
        <div className="thread-command-autocomplete" role="listbox" aria-label="Command suggestions">
          {suggestions.map((command) => {
            const isActive = command.command === selectedCommand;

            return (
              <button
                key={command.command}
                className="thread-command-autocomplete-option"
                aria-selected={isActive}
                data-active={isActive ? "true" : "false"}
                role="option"
                type="button"
                onClick={() => applySuggestion(command)}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
              >
                <span className="thread-command-autocomplete-command">{command.command}</span>
                <span className="thread-command-autocomplete-syntax">{command.syntax}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
