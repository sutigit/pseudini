/**
 * Names the language service reports for a document. Scanning the text instead
 * would turn every word of an English comment into a known name.
 */

import { ComposerRange } from "./session";

const MAX_IDENTIFIERS = 200;
const SEMANTIC_TOKEN_STRIDE = 5;
const IDENTIFIER_SHAPE = /^[A-Za-z_$][\w$]*$/;
const IDENTIFIER_WORD = /[A-Za-z_$][\w$]*/g;

/**
 * Legend types that name something. Covers the standard legend and the extra
 * `member` type that the TypeScript language service reports. Prose-carrying
 * types (`comment`, `string`) and types the keyword packs already own stay out.
 */
const IDENTIFIER_TOKEN_TYPES = new Set([
  "class",
  "decorator",
  "enum",
  "enumMember",
  "event",
  "function",
  "interface",
  "member",
  "method",
  "namespace",
  "parameter",
  "property",
  "struct",
  "type",
  "typeParameter",
  "variable",
]);

export interface DocumentSymbolLike {
  readonly name: string;
  readonly children?: readonly DocumentSymbolLike[];
}

/**
 * Decodes the semantic token stream: five integers per token, with the line and
 * the start column stored as deltas from the previous token.
 */
export function collectSemanticIdentifiers(
  lines: readonly string[],
  tokenTypes: readonly string[],
  data: ArrayLike<number>,
  excludedRange: ComposerRange,
): readonly string[] {
  const names = new Set<string>();
  let line = 0;
  let startCharacter = 0;

  for (
    let offset = 0;
    offset + SEMANTIC_TOKEN_STRIDE <= data.length;
    offset += SEMANTIC_TOKEN_STRIDE
  ) {
    const deltaLine = data[offset];
    line += deltaLine;
    startCharacter =
      deltaLine === 0 ? startCharacter + data[offset + 1] : data[offset + 1];

    if (!IDENTIFIER_TOKEN_TYPES.has(tokenTypes[data[offset + 3]] ?? "")) {
      continue;
    }
    if (isInside(excludedRange, line)) {
      continue;
    }

    const name = (lines[line] ?? "").slice(
      startCharacter,
      startCharacter + data[offset + 2],
    );
    if (IDENTIFIER_SHAPE.test(name)) {
      names.add(name);
    }
  }

  return sortAndCap(names);
}

function isInside(range: ComposerRange, line: number): boolean {
  return line >= range.startLine && line < range.endLineExclusive;
}

/**
 * Fallback for languages without a semantic token provider. A CSS symbol is a
 * selector such as `.card .title`, so take the identifier-shaped words of a name.
 */
export function collectSymbolIdentifiers(
  symbols: readonly DocumentSymbolLike[],
): readonly string[] {
  const names = new Set<string>();
  addSymbolWords(symbols, names);
  return sortAndCap(names);
}

function addSymbolWords(
  symbols: readonly DocumentSymbolLike[],
  names: Set<string>,
): void {
  for (const symbol of symbols) {
    for (const match of symbol.name.matchAll(IDENTIFIER_WORD)) {
      names.add(match[0]);
    }
    addSymbolWords(symbol.children ?? [], names);
  }
}

function sortAndCap(names: ReadonlySet<string>): readonly string[] {
  return [...names]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_IDENTIFIERS);
}
