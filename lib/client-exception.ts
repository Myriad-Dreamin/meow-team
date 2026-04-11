const UNKNOWN_CLIENT_EXCEPTION_MESSAGE = "An unknown client-side exception occurred.";
const UNKNOWN_REJECTION_MESSAGE = "A promise rejected without an error message.";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const readTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const readErrorName = (value: unknown): string | null => {
  if (value instanceof Error) {
    return readTrimmedString(value.name);
  }

  if (!isRecord(value)) {
    return null;
  }

  return readTrimmedString(value.name);
};

const readErrorMessage = (value: unknown): string | null => {
  if (value instanceof Error) {
    return readTrimmedString(value.message) ?? readTrimmedString(value.name);
  }

  if (typeof value === "string") {
    return readTrimmedString(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  return readTrimmedString(value.message) ?? readTrimmedString(value.reason);
};

const readErrorStack = (value: unknown): string | null => {
  if (value instanceof Error) {
    return readTrimmedString(value.stack);
  }

  if (!isRecord(value)) {
    return null;
  }

  return readTrimmedString(value.stack);
};

const readErrorDigest = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }

  return readTrimmedString(value.digest);
};

const serializeDebugValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return readTrimmedString(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  try {
    const serialized = JSON.stringify(value, null, 2);
    return readTrimmedString(serialized);
  } catch {
    return readTrimmedString(String(value));
  }
};

const formatLocation = (filename: string, line: number, column: number): string | null => {
  const trimmedFilename = filename.trim();

  if (!trimmedFilename) {
    return null;
  }

  if (line > 0 && column > 0) {
    return `${trimmedFilename}:${line}:${column}`;
  }

  if (line > 0) {
    return `${trimmedFilename}:${line}`;
  }

  return trimmedFilename;
};

const buildClientExceptionView = ({
  badge,
  summary,
  value,
  fallbackTitle,
  location,
  digest,
}: {
  badge: string;
  summary: string;
  value: unknown;
  fallbackTitle: string;
  location?: string | null;
  digest?: string | null;
}): ClientExceptionViewModel => {
  const message = readErrorMessage(value) ?? fallbackTitle;
  const name = readErrorName(value);
  const stack = readErrorStack(value);
  const resolvedDigest = digest ?? readErrorDigest(value);
  const debugValue = !stack && !readErrorMessage(value) ? serializeDebugValue(value) : null;

  return {
    badge,
    title: message,
    summary,
    name,
    location: location ?? null,
    digest: resolvedDigest,
    stack,
    debugValue,
  };
};

export const isClientExceptionDebugEnabled = process.env.NODE_ENV !== "production";

export type ClientExceptionViewModel = {
  badge: string;
  title: string;
  summary: string;
  name: string | null;
  location: string | null;
  digest: string | null;
  stack: string | null;
  debugValue: string | null;
};

export type ErrorBoundaryContext = "route" | "global";

export type WindowErrorLike = {
  error: unknown;
  message: string;
  filename: string;
  lineno: number;
  colno: number;
};

export type UnhandledRejectionLike = {
  reason: unknown;
};

export const formatBoundaryException = (
  error: Error & {
    digest?: string;
  },
  context: ErrorBoundaryContext,
): ClientExceptionViewModel => {
  return buildClientExceptionView({
    badge: "Client exception",
    summary:
      context === "route"
        ? "Captured by the route error boundary."
        : "Captured by the global error boundary.",
    value: error,
    fallbackTitle: UNKNOWN_CLIENT_EXCEPTION_MESSAGE,
    digest: readTrimmedString(error.digest),
  });
};

export const formatWindowErrorException = (event: WindowErrorLike): ClientExceptionViewModel => {
  return buildClientExceptionView({
    badge: "Client exception",
    summary: "Captured from the browser error event.",
    value: event.error ?? event.message,
    fallbackTitle: readTrimmedString(event.message) ?? UNKNOWN_CLIENT_EXCEPTION_MESSAGE,
    location: formatLocation(event.filename, event.lineno, event.colno),
  });
};

export const formatUnhandledRejectionException = (
  event: UnhandledRejectionLike,
): ClientExceptionViewModel => {
  return buildClientExceptionView({
    badge: "Unhandled rejection",
    summary: "Captured from an unhandled promise rejection.",
    value: event.reason,
    fallbackTitle: UNKNOWN_REJECTION_MESSAGE,
  });
};
