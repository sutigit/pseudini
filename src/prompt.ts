import { AimeInstruction } from "./commentParser";
import { FileContext } from "./fileContext";
import { extractJsonObject } from "./jsonObject";

export interface CodeReplacement {
  readonly line: number;
  readonly endLine?: number;
  readonly code: string;
}

interface ModelResponse {
  readonly replacements: readonly {
    readonly code: string;
  }[];
}

export function createImplementationPrompt(
  context: FileContext,
  instructions: readonly AimeInstruction[],
): string {
  const requestedReplacements = JSON.stringify(instructions, null, 2);

  return [
    "Replace each requested pseudocode comment with equivalent executable code.",
    "Use only identifiers and APIs supported by the supplied live source and file facts.",
    "Follow the file's language, formatting, naming, and existing patterns.",
    "Implement every stated requirement; do not summarize or omit pseudocode details.",
    "Do not change code outside the requested comment lines.",
    "Return JSON only. Do not use Markdown fences or explanatory text.",
    'Use this exact shape: {"replacements":[{"code":"replacement code"}]}.',
    "Each code value must contain the complete replacement.",
    "Start each replacement at column zero and indent only nested lines; Pseudini applies the",
    "comment's own indentation.",
    "Return replacements in the same order as the requested replacements.",
    "Return exactly one non-empty replacement for every requested line.",
    "",
    `Language identifier: ${context.languageId}`,
    `File name: ${context.fileName}`,
    `Indentation: ${context.indentation}`,
    `Imports: ${JSON.stringify(context.imports)}`,
    `Declarations: ${JSON.stringify(context.declarations)}`,
    `Requested replacements: ${requestedReplacements}`,
    "",
    "Current live source:",
    context.liveSource,
  ].join("\n");
}

export function parseModelResponse(
  responseText: string,
  instructions: readonly AimeInstruction[],
): readonly CodeReplacement[] {
  const parsed = parseJson(responseText);

  if (!isModelResponse(parsed)) {
    throw new Error("The AI response does not have the required replacement format.");
  }

  if (parsed.replacements.length !== instructions.length) {
    throw new Error("The AI response does not contain exactly one replacement per comment.");
  }

  return parsed.replacements.map((replacement, index) => ({
    line: instructions[index].line,
    ...(instructions[index].endLine === undefined
      ? {}
      : { endLine: instructions[index].endLine }),
    code: replacement.code,
  }));
}

function parseJson(responseText: string): unknown {
  try {
    return JSON.parse(extractJsonObject(responseText, "replacements"));
  } catch {
    throw new Error("The AI response is not valid JSON.");
  }
}

function isModelResponse(value: unknown): value is ModelResponse {
  if (!isRecord(value) || !Array.isArray(value.replacements)) {
    return false;
  }

  return value.replacements.every(
    (replacement) =>
      isRecord(replacement) &&
      typeof replacement.code === "string" &&
      replacement.code.trim().length > 0,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
