import {
  cloneElement,
  isValidElement,
  memo,
  useMemo,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { useUnistyles } from "react-native-unistyles";
import { Streamdown, type Components } from "streamdown";
import "streamdown/styles.css";
import { Fonts } from "@/constants/theme";
import type { InlinePathTarget } from "@/utils/inline-path";

export const supportsAssistantStreamingMarkdown = true;

export type AssistantStreamingMarkdownProps = {
  message: string;
  onLinkPress: (url: string) => boolean;
  onInlinePathPress?: (target: InlinePathTarget) => void;
  resolveInlinePathTarget: (content: string) => InlinePathTarget | null;
  resolveInlineCodeLinkUrl: (content: string) => string | null;
  renderImage: (input: { source: string; alt?: string; hasLeadingContent: boolean }) => ReactNode;
};

function getReactTextContent(value: ReactNode): string {
  if (value === null || value === undefined || typeof value === "boolean") {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(getReactTextContent).join("");
  }
  if (isValidElement(value)) {
    return getReactTextContent((value.props as { children?: ReactNode }).children);
  }
  return "";
}

function shouldUnwrapParagraph(children: ReactNode): boolean {
  const childList = (Array.isArray(children) ? children : [children]).filter(
    (child) => child !== null && child !== undefined && child !== "",
  );
  if (childList.length !== 1 || !isValidElement(childList[0])) {
    return false;
  }
  const props = childList[0].props as {
    node?: { tagName?: string };
    "data-block"?: string;
  };
  return props.node?.tagName === "img" || (props.node?.tagName === "code" && "data-block" in props);
}

function activateInlinePath(
  event: Pick<KeyboardEvent<HTMLElement>, "key" | "preventDefault">,
  callback: () => void,
) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  callback();
}

function buildHeadingStyle(input: {
  fontSize: number;
  lineHeight: number;
  fontWeight: CSSProperties["fontWeight"];
  marginTop: number;
  marginBottom: number;
  color: string;
}): CSSProperties {
  return {
    color: input.color,
    fontSize: input.fontSize,
    fontWeight: input.fontWeight,
    lineHeight: `${input.lineHeight}px`,
    margin: `${input.marginTop}px 0 ${input.marginBottom}px`,
    overflowWrap: "anywhere",
  };
}

export const AssistantStreamingMarkdown = memo(function AssistantStreamingMarkdown({
  message,
  onLinkPress,
  onInlinePathPress,
  resolveInlinePathTarget,
  resolveInlineCodeLinkUrl,
  renderImage,
}: AssistantStreamingMarkdownProps) {
  const { theme } = useUnistyles();

  const styles = useMemo(() => {
    const root: CSSProperties = {
      color: theme.colors.foreground,
      fontFamily: Fonts.sans,
      fontSize: theme.fontSize.base,
      lineHeight: "22px",
      minWidth: 0,
      overflowWrap: "anywhere",
      userSelect: "text",
      width: "100%",
    };
    const paragraph: CSSProperties = {
      margin: `0 0 ${theme.spacing[3]}px`,
      minWidth: 0,
      overflowWrap: "anywhere",
    };
    const inlineCode: CSSProperties = {
      backgroundColor: theme.colors.surface2,
      border: 0,
      borderRadius: theme.borderRadius.md,
      color: theme.colors.foreground,
      fontFamily: Fonts.mono,
      fontSize: theme.fontSize.sm,
      padding: `2px ${theme.spacing[1]}px`,
      whiteSpace: "break-spaces",
    };
    const pathChip: CSSProperties = {
      ...inlineCode,
      borderRadius: theme.borderRadius.full,
      cursor: "pointer",
      display: "inline",
      margin: `2px ${theme.spacing[1]}px 2px 0`,
      padding: `2px ${theme.spacing[2]}px`,
    };
    const codeBlock: CSSProperties = {
      backgroundColor: theme.colors.surface2,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: theme.borderRadius.md,
      color: theme.colors.foreground,
      display: "block",
      fontFamily: Fonts.mono,
      fontSize: theme.fontSize.sm,
      lineHeight: "20px",
      margin: `${theme.spacing[3]}px 0`,
      overflowX: "auto",
      padding: theme.spacing[3],
      whiteSpace: "pre",
    };
    const link: CSSProperties = {
      color: theme.colors.accentBright,
      cursor: "pointer",
      textDecorationLine: "none",
      overflowWrap: "anywhere",
    };

    return {
      root,
      paragraph,
      inlineCode,
      pathChip,
      codeBlock,
      link,
      strong: {
        fontWeight: theme.fontWeight.medium,
      } satisfies CSSProperties,
      emphasis: {
        fontStyle: "italic",
      } satisfies CSSProperties,
      delete: {
        color: theme.colors.foregroundMuted,
        textDecorationLine: "line-through",
      } satisfies CSSProperties,
      unorderedList: {
        margin: `${theme.spacing[2]}px 0`,
        paddingLeft: theme.spacing[4],
      } satisfies CSSProperties,
      orderedList: {
        margin: `${theme.spacing[2]}px 0`,
        paddingLeft: theme.spacing[4],
      } satisfies CSSProperties,
      listItem: {
        marginBottom: theme.spacing[1],
      } satisfies CSSProperties,
      blockquote: {
        backgroundColor: theme.colors.surface2,
        borderLeft: `4px solid ${theme.colors.primary}`,
        borderRadius: theme.borderRadius.md,
        color: theme.colors.foreground,
        margin: `${theme.spacing[3]}px 0`,
        padding: `${theme.spacing[3]}px ${theme.spacing[4]}px`,
      } satisfies CSSProperties,
      hr: {
        backgroundColor: theme.colors.border,
        border: 0,
        height: 1,
        margin: `${theme.spacing[6]}px 0`,
      } satisfies CSSProperties,
      tableWrapper: {
        margin: `${theme.spacing[3]}px 0`,
        maxWidth: "100%",
        overflowX: "auto",
      } satisfies CSSProperties,
      table: {
        border: `1px solid ${theme.colors.border}`,
        borderCollapse: "collapse",
        borderRadius: theme.borderRadius.md,
        fontSize: theme.fontSize.sm,
        width: "100%",
      } satisfies CSSProperties,
      tableHead: {
        backgroundColor: theme.colors.surface2,
      } satisfies CSSProperties,
      tableCell: {
        border: `1px solid ${theme.colors.border}`,
        color: theme.colors.foreground,
        padding: theme.spacing[2],
        textAlign: "left",
        verticalAlign: "top",
      } satisfies CSSProperties,
      h1: buildHeadingStyle({
        color: theme.colors.foreground,
        fontSize: theme.fontSize["3xl"],
        fontWeight: theme.fontWeight.bold,
        lineHeight: 32,
        marginBottom: theme.spacing[3],
        marginTop: theme.spacing[6],
      }),
      h2: buildHeadingStyle({
        color: theme.colors.foreground,
        fontSize: theme.fontSize["2xl"],
        fontWeight: theme.fontWeight.bold,
        lineHeight: 28,
        marginBottom: theme.spacing[3],
        marginTop: theme.spacing[6],
      }),
      h3: buildHeadingStyle({
        color: theme.colors.foreground,
        fontSize: theme.fontSize.xl,
        fontWeight: theme.fontWeight.semibold,
        lineHeight: 26,
        marginBottom: theme.spacing[2],
        marginTop: theme.spacing[4],
      }),
      h4: buildHeadingStyle({
        color: theme.colors.foreground,
        fontSize: theme.fontSize.lg,
        fontWeight: theme.fontWeight.semibold,
        lineHeight: 24,
        marginBottom: theme.spacing[2],
        marginTop: theme.spacing[4],
      }),
      h5: buildHeadingStyle({
        color: theme.colors.foreground,
        fontSize: theme.fontSize.base,
        fontWeight: theme.fontWeight.semibold,
        lineHeight: 22,
        marginBottom: theme.spacing[1],
        marginTop: theme.spacing[3],
      }),
      h6: buildHeadingStyle({
        color: theme.colors.foregroundMuted,
        fontSize: theme.fontSize.base,
        fontWeight: theme.fontWeight.semibold,
        lineHeight: 20,
        marginBottom: theme.spacing[1],
        marginTop: theme.spacing[3],
      }),
    };
  }, [theme]);

  const components = useMemo<Components>(
    () => ({
      p: ({ children, node: _node, style: _style, ...props }) => (
        <>
          {shouldUnwrapParagraph(children) ? (
            children
          ) : (
            <p {...props} style={styles.paragraph}>
              {children}
            </p>
          )}
        </>
      ),
      strong: ({ children, node: _node, style: _style, ...props }) => (
        <strong {...props} style={styles.strong}>
          {children}
        </strong>
      ),
      em: ({ children, node: _node, style: _style, ...props }) => (
        <em {...props} style={styles.emphasis}>
          {children}
        </em>
      ),
      del: ({ children, node: _node, style: _style, ...props }) => (
        <del {...props} style={styles.delete}>
          {children}
        </del>
      ),
      a: ({ children, href, node: _node, style: _style, ...props }) => {
        const resolvedHref = typeof href === "string" ? href : "";
        return (
          <a
            {...props}
            href={resolvedHref}
            onClick={(event) => {
              if (!resolvedHref) {
                return;
              }
              event.preventDefault();
              onLinkPress(resolvedHref);
            }}
            rel="noreferrer"
            style={styles.link}
          >
            {children}
          </a>
        );
      },
      inlineCode: ({ children, node: _node, style: _style, ...props }) => {
        const content = getReactTextContent(children);
        const inlinePathTarget = resolveInlinePathTarget(content);
        if (inlinePathTarget && onInlinePathPress) {
          const openPath = () => onInlinePathPress(inlinePathTarget);
          return (
            <code
              {...props}
              onClick={openPath}
              onKeyDown={(event) => activateInlinePath(event, openPath)}
              role="button"
              style={styles.pathChip}
              tabIndex={0}
            >
              {content}
            </code>
          );
        }

        const inlineCodeLinkUrl = resolveInlineCodeLinkUrl(content);
        if (inlineCodeLinkUrl) {
          return (
            <a
              href={inlineCodeLinkUrl}
              onClick={(event) => {
                event.preventDefault();
                onLinkPress(inlineCodeLinkUrl);
              }}
              rel="noreferrer"
              style={styles.link}
            >
              <code {...props} style={styles.inlineCode}>
                {content}
              </code>
            </a>
          );
        }

        return (
          <code {...props} style={styles.inlineCode}>
            {children}
          </code>
        );
      },
      pre: ({ children }) =>
        isValidElement(children)
          ? cloneElement(children as ReactElement<Record<string, unknown>>, {
              "data-block": "true",
            })
          : children,
      code: ({ children, node: _node, style: _style, ...props }) => {
        const domProps = { ...props };
        const isBlock = "data-block" in domProps;
        delete (domProps as Record<string, unknown>)["data-block"];
        if (isBlock) {
          return (
            <pre style={styles.codeBlock}>
              <code {...domProps}>{children}</code>
            </pre>
          );
        }
        return (
          <code {...domProps} style={styles.inlineCode}>
            {children}
          </code>
        );
      },
      ul: ({ children, node: _node, style: _style, ...props }) => (
        <ul {...props} style={styles.unorderedList}>
          {children}
        </ul>
      ),
      ol: ({ children, node: _node, style: _style, ...props }) => (
        <ol {...props} style={styles.orderedList}>
          {children}
        </ol>
      ),
      li: ({ children, node: _node, style: _style, ...props }) => (
        <li {...props} style={styles.listItem}>
          {children}
        </li>
      ),
      blockquote: ({ children, node: _node, style: _style, ...props }) => (
        <blockquote {...props} style={styles.blockquote}>
          {children}
        </blockquote>
      ),
      hr: ({ node: _node, style: _style, ...props }) => <hr {...props} style={styles.hr} />,
      h1: ({ children, node: _node, style: _style, ...props }) => (
        <h1 {...props} style={styles.h1}>
          {children}
        </h1>
      ),
      h2: ({ children, node: _node, style: _style, ...props }) => (
        <h2 {...props} style={styles.h2}>
          {children}
        </h2>
      ),
      h3: ({ children, node: _node, style: _style, ...props }) => (
        <h3 {...props} style={styles.h3}>
          {children}
        </h3>
      ),
      h4: ({ children, node: _node, style: _style, ...props }) => (
        <h4 {...props} style={styles.h4}>
          {children}
        </h4>
      ),
      h5: ({ children, node: _node, style: _style, ...props }) => (
        <h5 {...props} style={styles.h5}>
          {children}
        </h5>
      ),
      h6: ({ children, node: _node, style: _style, ...props }) => (
        <h6 {...props} style={styles.h6}>
          {children}
        </h6>
      ),
      table: ({ children, node: _node, style: _style, ...props }) => (
        <div style={styles.tableWrapper}>
          <table {...props} style={styles.table}>
            {children}
          </table>
        </div>
      ),
      thead: ({ children, node: _node, style: _style, ...props }) => (
        <thead {...props} style={styles.tableHead}>
          {children}
        </thead>
      ),
      th: ({ children, node: _node, style: _style, ...props }) => (
        <th {...props} style={styles.tableCell}>
          {children}
        </th>
      ),
      td: ({ children, node: _node, style: _style, ...props }) => (
        <td {...props} style={styles.tableCell}>
          {children}
        </td>
      ),
      img: ({ src, alt, node: _node, style: _style }) =>
        renderImage({
          source: typeof src === "string" ? src : "",
          alt: typeof alt === "string" ? alt : undefined,
          hasLeadingContent: false,
        }),
    }),
    [
      onInlinePathPress,
      onLinkPress,
      renderImage,
      resolveInlineCodeLinkUrl,
      resolveInlinePathTarget,
      styles,
    ],
  );

  return (
    <div style={styles.root}>
      <Streamdown
        animated={{
          animation: "fadeIn",
          duration: 120,
          easing: "ease-out",
          sep: "word",
          stagger: 8,
        }}
        caret="block"
        components={components}
        controls={false}
        dir="auto"
        isAnimating
        lineNumbers={false}
        mode="streaming"
        normalizeHtmlIndentation
      >
        {message}
      </Streamdown>
    </div>
  );
});
