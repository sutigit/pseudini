import { createHash } from "node:crypto";
import { PseudocodeInstruction } from "./commentParser";

export interface FileFacts {
  readonly contentHash: string;
  readonly languageId: string;
  readonly fileName: string;
  readonly imports: readonly string[];
  readonly declarations: readonly string[];
  readonly indentation: string;
}

export interface FileContext extends FileFacts {
  readonly liveSource: string;
  readonly usedFullFile: boolean;
}

const CONTEXT_LINES_BEFORE = 30;
const CONTEXT_LINES_AFTER = 30;
const SMALL_FILE_LINE_LIMIT = 120;
const AMBIGUOUS_REFERENCE_PATTERN =
  /\b(?:same as|like above|like below|elsewhere|existing pattern|other function)\b/i;
const DECLARATION_MODIFIERS =
  "(?:(?:export|public|private|protected|internal|static|async)\\s+)*";
const DECLARATION_KINDS =
  "(?:class|interface|type|enum|struct|function|def|func)";
const DECLARATION_PATTERN = new RegExp(
  `^\\s*${DECLARATION_MODIFIERS}${DECLARATION_KINDS}\\s+[A-Za-z_$][\\w$]*`,
);

export function buildFileFacts(
  documentText: string,
  languageId: string,
  fileName: string,
): FileFacts {
  const lines = documentText.split(/\r?\n/);

  return {
    contentHash: hashContent(documentText),
    languageId,
    fileName,
    imports: extractImports(lines),
    declarations: extractDeclarations(lines),
    indentation: detectIndentation(lines),
  };
}

export function buildFileContext(
  documentText: string,
  languageId: string,
  fileName: string,
  instructions: readonly PseudocodeInstruction[],
  suppliedFacts?: FileFacts,
): FileContext {
  const contentHash = hashContent(documentText);
  const facts =
    suppliedFacts?.contentHash === contentHash
      ? suppliedFacts
      : buildFileFacts(documentText, languageId, fileName);
  const lines = documentText.split(/\r?\n/);
  const usedFullFile =
    lines.length <= SMALL_FILE_LINE_LIMIT ||
    instructions.some(({ pseudocode }) => AMBIGUOUS_REFERENCE_PATTERN.test(pseudocode));

  return {
    ...facts,
    liveSource: usedFullFile ? documentText : extractLiveSections(lines, instructions),
    usedFullFile,
  };
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function extractLiveSections(
  lines: readonly string[],
  instructions: readonly PseudocodeInstruction[],
): string {
  const ranges = instructions
    .map(({ line, endLine }) => {
      const scope = findScopeRange(lines, line);
      return {
        start: scope?.start ?? Math.max(0, line - CONTEXT_LINES_BEFORE),
        end:
          scope?.end ??
          Math.min(lines.length - 1, (endLine ?? line) + CONTEXT_LINES_AFTER),
      };
    })
    .sort((left, right) => left.start - right.start);
  const mergedRanges = mergeRanges(ranges);

  return mergedRanges
    .map(
      ({ start, end }) =>
        `// Lines ${start + 1}-${end + 1}\n${lines.slice(start, end + 1).join("\n")}`,
    )
    .join("\n\n");
}

function findScopeRange(
  lines: readonly string[],
  targetLine: number,
): { readonly start: number; readonly end: number } | undefined {
  for (let line = targetLine; line >= 0; line -= 1) {
    if (isScopeHeader(lines[line])) {
      return {
        start: line,
        end: findScopeEnd(lines, line),
      };
    }
  }

  return undefined;
}

function findScopeEnd(lines: readonly string[], startLine: number): number {
  if (!/:\s*$/.test(lines[startLine])) {
    const bracedEnd = findBracedScopeEnd(lines, startLine);
    if (bracedEnd !== undefined) {
      return bracedEnd;
    }
  }

  const startingIndent = lines[startLine].match(/^\s*/)?.[0].length ?? 0;
  for (let line = startLine + 1; line < lines.length; line += 1) {
    if (!lines[line].trim()) {
      continue;
    }
    const indentation = lines[line].match(/^\s*/)?.[0].length ?? 0;
    if (indentation <= startingIndent) {
      return line - 1;
    }
  }

  return Math.min(lines.length - 1, startLine + CONTEXT_LINES_AFTER);
}

function findBracedScopeEnd(
  lines: readonly string[],
  startLine: number,
): number | undefined {
  let depth = 0;
  let foundOpeningBrace = false;
  let blockComment = false;
  let quote: string | undefined;
  let escaped = false;

  for (let line = startLine; line < lines.length; line += 1) {
    const text = lines[line];

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const next = text[index + 1];

      if (blockComment) {
        if (character === "*" && next === "/") {
          blockComment = false;
          index += 1;
        }
        continue;
      }
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          quote = undefined;
        }
        continue;
      }
      if (character === "/" && next === "/") {
        break;
      }
      if (character === "/" && next === "*") {
        blockComment = true;
        index += 1;
      } else if (character === '"' || character === "'" || character === "`") {
        quote = character;
      } else if (character === "{") {
        depth += 1;
        foundOpeningBrace = true;
      } else if (character === "}") {
        depth -= 1;
      }
    }

    if (foundOpeningBrace && depth <= 0) {
      return line;
    }
  }

  return undefined;
}

function isScopeHeader(line: string): boolean {
  if (/^\s*(?:\/\/|#|--|;|\/\*|\*|<!--)/.test(line)) {
    return false;
  }

  return (
    /\b(?:function|class|interface|enum|struct|impl|def|func)\b/.test(line) ||
    /(?:=>|\))\s*\{\s*$/.test(line)
  );
}

function mergeRanges(
  ranges: readonly { readonly start: number; readonly end: number }[],
): readonly { readonly start: number; readonly end: number }[] {
  const merged: { start: number; end: number }[] = [];

  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

function extractImports(lines: readonly string[]): readonly string[] {
  return lines.filter((line) =>
    /^\s*(?:import\b|export\s+.*\s+from\b|from\s+\S+\s+import\b|require\(|using\b|#include\b)/.test(
      line,
    ),
  );
}

function extractDeclarations(lines: readonly string[]): readonly string[] {
  return lines
    .filter((line) => DECLARATION_PATTERN.test(line))
    .map((line) => line.trim())
    .slice(0, 100);
}

function detectIndentation(lines: readonly string[]): string {
  const indents = lines
    .map((line) => line.match(/^(\s+)\S/)?.[1])
    .filter((indent): indent is string => Boolean(indent));

  if (indents.some((indent) => indent.includes("\t"))) {
    return "tabs";
  }

  const smallest = indents.reduce(
    (minimum, indent) => Math.min(minimum, indent.length),
    Number.POSITIVE_INFINITY,
  );
  return Number.isFinite(smallest) ? `${smallest} spaces` : "unknown";
}
