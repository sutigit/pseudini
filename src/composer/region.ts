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

export function createRegionInsertion(indentation: string): string {
  return `\n${indentation}`;
}

export function createRegionReplacement(
  generatedCode: string,
): string {
  return `\n${generatedCode}`;
}

function stripIndentation(line: string, indentation: string): string {
  return line.startsWith(indentation) ? line.slice(indentation.length) : line.trimStart();
}
