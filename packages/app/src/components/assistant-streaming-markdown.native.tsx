import type { ReactNode } from "react";
import type { InlinePathTarget } from "@/utils/inline-path";

export const supportsAssistantStreamingMarkdown = false;

export type AssistantStreamingMarkdownProps = {
  message: string;
  onLinkPress: (url: string) => boolean;
  onInlinePathPress?: (target: InlinePathTarget) => void;
  resolveInlinePathTarget: (content: string) => InlinePathTarget | null;
  resolveInlineCodeLinkUrl: (content: string) => string | null;
  renderImage: (input: { source: string; alt?: string; hasLeadingContent: boolean }) => ReactNode;
};

export function AssistantStreamingMarkdown(_props: AssistantStreamingMarkdownProps) {
  return null;
}
