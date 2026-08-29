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

function stripIndentation(line: string, indentation: string): string {
  return line.startsWith(indentation) ? line.slice(indentation.length) : line.trimStart();
}
