export type ComposerPhase = "composing" | "pending";

export interface ComposerRange {
  readonly startLine: number;
  readonly endLineExclusive: number;
}

export interface ComposerSession {
  readonly documentUri: string;
  readonly phase: ComposerPhase;
  readonly range: ComposerRange;
  readonly indentation: string;
}

export function createComposerSession(
  documentUri: string,
  startLine: number,
  indentation: string,
): ComposerSession {
  return {
    documentUri,
    phase: "composing",
    range: { startLine, endLineExclusive: startLine + 1 },
    indentation,
  };
}

export function updateComposerRange(
  session: ComposerSession,
  changedStartLine: number,
  changedEndLine: number,
  insertedLineCount: number,
): ComposerSession | undefined {
  if (
    changedStartLine < session.range.startLine ||
    changedEndLine >= session.range.endLineExclusive
  ) {
    return undefined;
  }

  const removedLineCount = changedEndLine - changedStartLine;
  const lineDelta = insertedLineCount - removedLineCount - 1;
  const endLineExclusive = Math.max(
    session.range.startLine + 1,
    session.range.endLineExclusive + lineDelta,
  );

  return {
    ...session,
    range: { ...session.range, endLineExclusive },
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
  };
}
