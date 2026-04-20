"use client";

import { useId } from "react";
import { ThreadCommandEditor } from "@/components/thread-command-editor";

export type ThreadCommandComposerNotice = {
  kind: "error" | "info";
  message: string;
};

type ThreadCommandComposerProps = {
  disabledReason: string | null;
  isPending: boolean;
  notice: ThreadCommandComposerNotice | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
  proposalNumbers: number[];
  value: string;
};

export function ThreadCommandComposer({
  disabledReason,
  isPending,
  notice,
  onChange,
  onSubmit,
  proposalNumbers,
  value,
}: ThreadCommandComposerProps) {
  const helperTextId = useId();
  const disabledReasonId = useId();
  const isDisabled = Boolean(disabledReason) || isPending;
  const placeholder = disabledReason ?? "Enter slash commands...";
  const canSubmit = !isDisabled && value.trim().length > 0;
  const describedBy = [helperTextId, disabledReason ? disabledReasonId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="thread-command-composer">
      <label className="harness-form-field feedback-field thread-command-field">
        <ThreadCommandEditor
          ariaDescribedBy={describedBy || undefined}
          ariaLabel="Command"
          disabled={isDisabled}
          placeholder={placeholder}
          proposalNumbers={proposalNumbers}
          value={value}
          onChange={onChange}
        />
      </label>

      <div className="thread-command-actions">
        <button className="secondary-button" disabled={!canSubmit} type="button" onClick={onSubmit}>
          {isPending ? "Running command..." : "Run Command"}
        </button>
      </div>

      {notice ? (
        <p className={notice.kind === "error" ? "error-callout" : "info-callout"}>
          {notice.message}
        </p>
      ) : null}
    </section>
  );
}
