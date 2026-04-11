import type { ComponentPropsWithoutRef } from "react";
import MarkdownIt from "markdown-it";

const laneMarkdownRenderer = new MarkdownIt({
  html: false,
  linkify: false,
});

laneMarkdownRenderer.disable(["image"]);

const defaultLinkOpenRenderer =
  laneMarkdownRenderer.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

laneMarkdownRenderer.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  token.attrJoin("class", "lane-meta-link");
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noreferrer noopener");
  return defaultLinkOpenRenderer(tokens, idx, options, env, self);
};

export const renderLaneMarkdown = (text: string): string => {
  return laneMarkdownRenderer.renderInline(text);
};

type LaneMarkdownTextProps = Omit<
  ComponentPropsWithoutRef<"p">,
  "children" | "dangerouslySetInnerHTML"
> & {
  text: string;
};

export function LaneMarkdownText({ text, ...props }: LaneMarkdownTextProps) {
  return <p {...props} dangerouslySetInnerHTML={{ __html: renderLaneMarkdown(text) }} />;
}
