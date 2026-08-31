export interface ComposerTokenSpan {
  readonly start: number;
  readonly end: number;
}

const WORD_PATTERN = /[A-Za-z_$][\w$-]*/g;

export function classifyComposerTokens(
  text: string,
  identifiers: ReadonlySet<string>,
): readonly ComposerTokenSpan[] {
  const tokens: ComposerTokenSpan[] = [];

  for (const match of text.matchAll(WORD_PATTERN)) {
    if (match.index === undefined || !identifiers.has(match[0])) {
      continue;
    }
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return tokens;
}

/**
 * The offsets no classified token covers, in ascending order. Callers colour
 * these separately so that no two decorations claim the same characters, which
 * would leave the winning colour up to the editor.
 */
export function findUnclassifiedSpans(
  lineLength: number,
  tokens: readonly ComposerTokenSpan[],
): readonly ComposerTokenSpan[] {
  const spans: ComposerTokenSpan[] = [];
  let offset = 0;

  for (const token of tokens) {
    if (token.start > offset) {
      spans.push({ start: offset, end: token.start });
    }
    offset = Math.max(offset, token.end);
  }
  if (offset < lineLength) {
    spans.push({ start: offset, end: lineLength });
  }

  return spans;
}
