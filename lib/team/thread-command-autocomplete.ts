import { SUPPORTED_THREAD_COMMANDS, type ThreadCommandDefinition } from "@/lib/team/thread-command";

export type ThreadCommandAutocompleteToken = {
  from: number;
  to: number;
  text: string;
};

export type ThreadCommandAutocompleteMatchResult = {
  items: ThreadCommandDefinition[];
  token: ThreadCommandAutocompleteToken;
};

type ThreadCommandSelection = {
  selectionEnd?: number;
  selectionStart: number;
  value: string;
};

const clampSelection = (value: string, selection: number) => {
  return Math.min(Math.max(selection, 0), value.length);
};

const getFirstCommandTokenRange = (value: string) => {
  const tokenStart = value.search(/\S/);
  if (tokenStart < 0) {
    return null;
  }

  const tokenEndOffset = value.slice(tokenStart).search(/\s/);
  const tokenEnd = tokenEndOffset < 0 ? value.length : tokenStart + tokenEndOffset;

  return {
    tokenEnd,
    tokenStart,
  };
};

export const getActiveThreadCommandToken = ({
  selectionStart,
  selectionEnd = selectionStart,
  value,
}: ThreadCommandSelection): ThreadCommandAutocompleteToken | null => {
  const caretStart = clampSelection(value, selectionStart);
  const caretEnd = clampSelection(value, selectionEnd);
  if (caretStart !== caretEnd) {
    return null;
  }

  const tokenRange = getFirstCommandTokenRange(value);
  if (!tokenRange) {
    return null;
  }

  const { tokenEnd, tokenStart } = tokenRange;
  if (caretStart < tokenStart || caretStart > tokenEnd) {
    return null;
  }

  const text = value.slice(tokenStart, tokenEnd);
  if (!text.startsWith("/")) {
    return null;
  }

  return {
    from: tokenStart,
    text,
    to: tokenEnd,
  };
};

export const getThreadCommandAutocompleteMatches = (
  selection: ThreadCommandSelection,
): ThreadCommandAutocompleteMatchResult | null => {
  const token = getActiveThreadCommandToken(selection);
  if (!token) {
    return null;
  }

  const items = SUPPORTED_THREAD_COMMANDS.filter((command) =>
    command.command.startsWith(token.text),
  );
  if (items.length === 0) {
    return null;
  }

  return {
    items: [...items],
    token,
  };
};

export const applyThreadCommandAutocomplete = ({
  command,
  ...selection
}: ThreadCommandSelection & {
  command: ThreadCommandDefinition;
}) => {
  const token = getActiveThreadCommandToken(selection);
  if (!token) {
    return null;
  }

  const prefix = selection.value.slice(0, token.from);
  const suffix = selection.value.slice(token.to);
  const normalizedSuffix = suffix.length === 0 ? " " : /^\s/.test(suffix) ? suffix : ` ${suffix}`;
  const nextValue = `${prefix}${command.insertText}${normalizedSuffix}`;
  const nextSelection = prefix.length + command.insertText.length + 1;

  return {
    selectionEnd: nextSelection,
    selectionStart: nextSelection,
    value: nextValue,
  };
};
