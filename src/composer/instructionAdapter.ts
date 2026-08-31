import { PseudocodeInstruction } from "../commentParser";
import { ComposerSession } from "./session";

export function createComposerInstruction(
  session: ComposerSession,
  pseudocode: string,
): PseudocodeInstruction {
  const endLine = session.range.endLineExclusive - 1;
  return {
    line: session.range.startLine,
    ...(endLine > session.range.startLine ? { endLine } : {}),
    pseudocode: pseudocode.trim(),
  };
}
