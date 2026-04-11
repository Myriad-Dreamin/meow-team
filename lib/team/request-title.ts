const DEFAULT_REQUEST_TITLE = "Untitled Request";
const MAX_REQUEST_TITLE_LENGTH = 80;

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/gu, " ").trim();
};

const trimTitlePunctuation = (value: string): string => {
  return value.replace(/^[`"'#*:_\-\s]+|[`"'#*:_\-\s.?!,;]+$/gu, "").trim();
};

const shortenTitle = (value: string): string => {
  if (value.length <= MAX_REQUEST_TITLE_LENGTH) {
    return value;
  }

  const shortened = value.slice(0, MAX_REQUEST_TITLE_LENGTH).trim();
  const lastSpace = shortened.lastIndexOf(" ");

  if (lastSpace < 24) {
    return shortened;
  }

  return shortened.slice(0, lastSpace).trim();
};

export const normalizeRequestTitle = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(
    value.replace(/^(request\s+title|title)\s*:\s*/iu, "").replace(/[\r\n]+/gu, " "),
  );
  const trimmed = trimTitlePunctuation(shortenTitle(normalized));

  return trimmed || null;
};

export const buildDeterministicRequestTitle = (input: string | null | undefined): string => {
  const normalized = normalizeWhitespace(
    (input ?? "").replace(/[\r\n]+/gu, " ").replace(/[`*_>#]/gu, ""),
  );

  if (!normalized) {
    return DEFAULT_REQUEST_TITLE;
  }

  const firstSentence = normalized.split(/(?<=[.!?])\s+/u)[0] ?? normalized;
  const shortened = shortenTitle(firstSentence);
  const trimmed = trimTitlePunctuation(shortened);

  return trimmed || DEFAULT_REQUEST_TITLE;
};

export const resolveDisplayRequestTitle = ({
  requestTitle,
  requestText,
}: {
  requestTitle: string | null | undefined;
  requestText: string | null | undefined;
}): string => {
  return normalizeRequestTitle(requestTitle) ?? buildDeterministicRequestTitle(requestText);
};
