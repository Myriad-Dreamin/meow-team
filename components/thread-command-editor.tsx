"use client";

import { useEffect, useRef } from "react";
import { CodeMirrorTextEditor } from "@/components/codemirror-text-editor";
import { getThreadCommandAutocomplete } from "@/lib/team/thread-command";

type ThreadCommandEditorProps = {
  ariaDescribedBy?: string;
  ariaLabel: string;
  disabled: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  proposalNumbers: number[];
  value: string;
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
  const proposalNumbersRef = useRef(proposalNumbers);
  const autocomplete = ({
    cursorIndex,
    value: currentValue,
  }: {
    cursorIndex: number;
    value: string;
  }) =>
    getThreadCommandAutocomplete({
      cursorIndex,
      proposalNumbers: proposalNumbersRef.current,
      value: currentValue,
    });

  useEffect(() => {
    proposalNumbersRef.current = proposalNumbers;
  }, [proposalNumbers]);

  return (
    <CodeMirrorTextEditor
      ariaDescribedBy={ariaDescribedBy}
      ariaLabel={ariaLabel}
      autocomplete={autocomplete}
      disabled={disabled}
      editorClassName="thread-command-editor"
      editorDataAttributeName="data-thread-command-editor"
      editorDataAttributeValue="codemirror"
      onChange={onChange}
      placeholder={placeholder}
      shellClassName="thread-command-editor-shell"
      value={value}
    />
  );
}
