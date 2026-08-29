export type ComposerTokenKind = "identifier" | "keyword";

export interface ComposerToken {
  readonly start: number;
  readonly end: number;
  readonly kind: ComposerTokenKind;
}

const WORD_PATTERN = /[A-Za-z_$][\w$-]*/g;

export function classifyComposerTokens(
  text: string,
  identifiers: ReadonlySet<string>,
  keywords: ReadonlySet<string>,
): readonly ComposerToken[] {
  const tokens: ComposerToken[] = [];

  for (const match of text.matchAll(WORD_PATTERN)) {
    if (match.index === undefined) {
      continue;
    }
    const kind = keywords.has(match[0])
      ? "keyword"
      : identifiers.has(match[0])
        ? "identifier"
        : undefined;
    if (kind) {
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        kind,
      });
    }
  }

  return tokens;
}
