import { CommentWrapper } from "./commentSyntax";
import { ComposerRange } from "./session";

export function readRegionText(
  lines: readonly string[],
  range: ComposerRange,
  indentation: string,
): string {
  return lines
    .slice(range.startLine, range.endLineExclusive)
    .map((line) => stripIndentation(line, indentation))
    .join("\n");
}

export function createRegionInsertion(
  indentation: string,
  wrapper: CommentWrapper,
): string {
  return [
    "",
    `${indentation}${wrapper.opening}`,
    indentation,
    `${indentation}${wrapper.closing}`,
  ].join("\n");
}

/** Generated code takes the place the region occupied: after the anchor line. */
export function createCodeInsertion(code: string): string {
  return `\n${code}`;
}

/**
 * Deleting the region is only safe for text the composer wrote itself. True
 * when the recorded range still sits inside the file and still opens and closes
 * with the composer's own delimiter lines.
 */
export function isRegionIntact(
  lines: readonly string[],
  range: ComposerRange,
  wrapper: CommentWrapper,
): boolean {
  return (
    range.startLine >= 1 &&
    range.endLineExclusive <= lines.length &&
    lines[range.startLine]?.trim() === wrapper.opening &&
    lines[range.endLineExclusive - 1]?.trim() === wrapper.closing
  );
}

function stripIndentation(line: string, indentation: string): string {
  return line.startsWith(indentation) ? line.slice(indentation.length) : line.trimStart();
}
