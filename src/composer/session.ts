export type ComposerPhase = "composing" | "pending";

export interface ComposerRange {
  readonly startLine: number;
  readonly endLineExclusive: number;
}

/**
 * The document as it was before the composer touched it. Confirm and cancel
 * rewind to this state so the whole interaction costs one undo step.
 */
export interface ComposerOrigin {
  readonly text: string;
  readonly anchorLine: number;
}

export interface ComposerSession {
  readonly documentUri: string;
  readonly phase: ComposerPhase;
  readonly range: ComposerRange;
  readonly contentRange: ComposerRange;
  readonly indentation: string;
  readonly origin: ComposerOrigin;
}

export interface ComposerOpening {
  readonly documentUri: string;
  readonly startLine: number;
  readonly indentation: string;
  readonly origin: ComposerOrigin;
}

export function createComposerSession({
  documentUri,
  startLine,
  indentation,
  origin,
}: ComposerOpening): ComposerSession {
  return {
    documentUri,
    phase: "composing",
    range: { startLine, endLineExclusive: startLine + 3 },
    contentRange: {
      startLine: startLine + 1,
      endLineExclusive: startLine + 2,
    },
    indentation,
    origin,
  };
}

export function updateComposerRange(
  session: ComposerSession,
  changedStartLine: number,
  changedEndLine: number,
  insertedLineCount: number,
): ComposerSession | undefined {
  if (
    changedStartLine < session.contentRange.startLine ||
    changedEndLine >= session.contentRange.endLineExclusive
  ) {
    return undefined;
  }

  const removedLineCount = changedEndLine - changedStartLine;
  const lineDelta = insertedLineCount - removedLineCount - 1;
  const endLineExclusive = Math.max(
    session.contentRange.startLine + 1,
    session.contentRange.endLineExclusive + lineDelta,
  );
  const regionEndLineExclusive = Math.max(
    session.range.startLine + 3,
    session.range.endLineExclusive + lineDelta,
  );

  return {
    ...session,
    range: { ...session.range, endLineExclusive: regionEndLineExclusive },
    contentRange: { ...session.contentRange, endLineExclusive },
  };
}

export function beginGeneration(session: ComposerSession): ComposerSession {
  if (session.phase !== "composing") {
    throw new Error("The inline composer is already generating code.");
  }
  return { ...session, phase: "pending" };
}

export function adjustComposerRange(
  session: ComposerSession,
  startLineDelta: number,
  endLineDelta: number,
): ComposerSession {
  return {
    ...session,
    range: {
      startLine: session.range.startLine + startLineDelta,
      endLineExclusive: session.range.endLineExclusive + endLineDelta,
    },
    contentRange: {
      startLine: session.contentRange.startLine + startLineDelta,
      endLineExclusive: session.contentRange.endLineExclusive + endLineDelta,
    },
  };
}

export function isComposerContentLine(
  session: ComposerSession,
  line: number,
): boolean {
  return (
    line >= session.contentRange.startLine &&
    line < session.contentRange.endLineExclusive
  );
}

export function readComposerWrapperLines(
  session: ComposerSession,
): readonly number[] {
  return [session.range.startLine, session.range.endLineExclusive - 1];
}

/**
 * The wrapper delimiters are hidden, so the caret must never rest on them.
 * Returns the content line to move to, or undefined when no move is needed.
 */
export function clampToComposerContent(
  session: ComposerSession,
  line: number,
): { readonly line: number; readonly edge: "start" | "end" } | undefined {
  if (isComposerContentLine(session, line)) {
    return undefined;
  }
  if (line === session.range.startLine) {
    return { line: session.contentRange.startLine, edge: "start" };
  }
  if (line === session.range.endLineExclusive - 1) {
    return { line: session.contentRange.endLineExclusive - 1, edge: "end" };
  }
  return undefined;
}
