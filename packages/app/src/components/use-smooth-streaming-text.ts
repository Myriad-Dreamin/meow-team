import { useCallback, useEffect, useRef, useState } from "react";

const MIN_STREAMING_TOKEN_RATE = 30;
const STREAMING_RENDER_INTERVAL_MS = 33;

function getNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function isCjkCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x20000 && codePoint <= 0x2a6df) ||
    (codePoint >= 0x2a700 && codePoint <= 0x2b73f) ||
    (codePoint >= 0x2b740 && codePoint <= 0x2b81f) ||
    (codePoint >= 0x2b820 && codePoint <= 0x2ceaf)
  );
}

function getApproximateTokenWeight(char: string): number {
  if (/^\s$/u.test(char)) {
    return 0;
  }

  const codePoint = char.codePointAt(0) ?? 0;
  if (isCjkCodePoint(codePoint)) {
    return 1;
  }

  if (/^[A-Za-z0-9_]$/u.test(char)) {
    return 0.25;
  }

  return 0.5;
}

export function estimateStreamingTokenCount(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  let weight = 0;
  for (const char of text) {
    weight += getApproximateTokenWeight(char);
  }
  return Math.max(1, Math.ceil(weight));
}

export function getStreamingTokenRate(remainingTokenCount: number): number {
  if (!Number.isFinite(remainingTokenCount) || remainingTokenCount <= 0) {
    return MIN_STREAMING_TOKEN_RATE;
  }
  return remainingTokenCount < MIN_STREAMING_TOKEN_RATE
    ? MIN_STREAMING_TOKEN_RATE
    : remainingTokenCount;
}

export function getStreamingRevealIndex(
  text: string,
  startIndex: number,
  tokenBudget: number,
): number {
  if (startIndex >= text.length) {
    return text.length;
  }
  if (!Number.isFinite(tokenBudget) || tokenBudget <= 0) {
    return startIndex;
  }

  let index = Math.max(0, startIndex);
  let spent = 0;

  while (index < text.length && spent < tokenBudget) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) {
      break;
    }

    const char = String.fromCodePoint(codePoint);
    index += char.length;
    spent += getApproximateTokenWeight(char);
  }

  while (index < text.length) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) {
      break;
    }

    const char = String.fromCodePoint(codePoint);
    if (getApproximateTokenWeight(char) > 0) {
      break;
    }
    index += char.length;
  }

  return index > startIndex ? index : Math.min(text.length, startIndex + 1);
}

export function useSmoothStreamingText(text: string, enabled: boolean): string {
  const [displayedText, setDisplayedText] = useState(text);
  const displayedTextRef = useRef(text);
  const targetTextRef = useRef(text);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTickAtRef = useRef(getNow());
  const tokenCarryRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) {
      return;
    }
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const commitDisplayedText = useCallback((nextText: string) => {
    displayedTextRef.current = nextText;
    setDisplayedText(nextText);
  }, []);

  const runTickRef = useRef<() => void>(() => {});
  const scheduleTick = useCallback(() => {
    if (timerRef.current !== null) {
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      runTickRef.current();
    }, STREAMING_RENDER_INTERVAL_MS);
  }, []);

  const runTick = useCallback(() => {
    const targetText = targetTextRef.current;
    const currentText = displayedTextRef.current;

    if (currentText === targetText) {
      tokenCarryRef.current = 0;
      return;
    }

    if (!targetText.startsWith(currentText)) {
      tokenCarryRef.current = 0;
      commitDisplayedText(targetText);
      return;
    }

    const now = getNow();
    const elapsedMs = Math.max(0, now - lastTickAtRef.current);
    lastTickAtRef.current = now;

    const remainingText = targetText.slice(currentText.length);
    const remainingTokens = estimateStreamingTokenCount(remainingText);
    const tokenRate = getStreamingTokenRate(remainingTokens);
    tokenCarryRef.current += (tokenRate * elapsedMs) / 1000;

    const wholeTokenBudget = Math.floor(tokenCarryRef.current);
    const tokenBudget =
      wholeTokenBudget > 0 || elapsedMs >= STREAMING_RENDER_INTERVAL_MS ? wholeTokenBudget || 1 : 0;

    if (tokenBudget <= 0) {
      scheduleTick();
      return;
    }

    tokenCarryRef.current = Math.max(0, tokenCarryRef.current - tokenBudget);
    const nextIndex = getStreamingRevealIndex(targetText, currentText.length, tokenBudget);
    const nextText = targetText.slice(0, nextIndex);
    commitDisplayedText(nextText);

    if (nextText !== targetText) {
      scheduleTick();
    } else {
      tokenCarryRef.current = 0;
    }
  }, [commitDisplayedText, scheduleTick]);

  runTickRef.current = runTick;

  useEffect(() => {
    targetTextRef.current = text;

    if (!enabled) {
      clearTimer();
      tokenCarryRef.current = 0;
      commitDisplayedText(text);
      return;
    }

    const currentText = displayedTextRef.current;
    if (currentText === text) {
      return;
    }

    if (!text.startsWith(currentText)) {
      clearTimer();
      tokenCarryRef.current = 0;
      commitDisplayedText(text);
      return;
    }

    if (timerRef.current === null) {
      lastTickAtRef.current = getNow();
    }
    scheduleTick();
  }, [clearTimer, commitDisplayedText, enabled, scheduleTick, text]);

  useEffect(() => clearTimer, [clearTimer]);

  return enabled ? displayedText : text;
}
