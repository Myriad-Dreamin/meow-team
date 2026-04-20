"use client";

import { CodeMirrorTextEditor } from "@/components/codemirror-text-editor";
import styles from "./codemirror-text-editor.module.css";
import { getTeamExecutionModeAutocomplete } from "@/lib/team/execution-mode";

type TeamRequestEditorProps = {
  ariaDescribedBy?: string;
  ariaLabel: string;
  disabled: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

export function TeamRequestEditor({
  ariaDescribedBy,
  ariaLabel,
  disabled,
  onChange,
  placeholder,
  value,
}: TeamRequestEditorProps) {
  return (
    <CodeMirrorTextEditor
      ariaDescribedBy={ariaDescribedBy}
      ariaLabel={ariaLabel}
      autocomplete={getTeamExecutionModeAutocomplete}
      disabled={disabled}
      editorClassName={styles["team-request-editor"]}
      editorDataAttributeName="data-team-request-editor"
      editorDataAttributeValue="codemirror"
      onChange={onChange}
      placeholder={placeholder}
      shellClassName={styles["team-request-editor-shell"]}
      value={value}
    />
  );
}
