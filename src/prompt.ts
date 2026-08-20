import { AimeInstruction } from "./commentParser";

export interface CodeReplacement {
  readonly line: number;
  readonly code: string;
}

interface ModelResponse {
  readonly replacements: readonly CodeReplacement[];
}

export function createImplementationPrompt(
  languageId: string,
  fileName: string,
  documentText: string,
  instructions: readonly AimeInstruction[],
): string {
  const requestedReplacements = JSON.stringify(instructions, null, 2);

  return [
    "Replace each requested pseudocode comment with equivalent executable code.",
    "Follow the file's language, formatting, naming, architecture, and existing patterns.",
    "Do not change code outside the requested comment lines.",
    // Tool calls add a round trip each, so keep the agent working from the supplied text.
    "Answer immediately from the file contents below. Do not read or search other files.",
    "Return JSON only. Do not use Markdown fences or explanatory text.",
    'Use this exact shape: {"replacements":[{"line":0,"code":"replacement code"}]}.',
    "Each code value must contain the complete replacement, including indentation.",
    "Return exactly one non-empty replacement for every requested line.",
    "",
    `Language identifier: ${languageId}`,
    `File name: ${fileName}`,
    `Requested replacements: ${requestedReplacements}`,
    "",
    "File contents:",
    documentText,
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

  const requestedLines = new Set(instructions.map(({ line }) => line));
  const returnedLines = new Set(parsed.replacements.map(({ line }) => line));
  const hasExactLines =
    returnedLines.size === requestedLines.size &&
    [...requestedLines].every((line) => returnedLines.has(line));

  if (!hasExactLines || parsed.replacements.length !== instructions.length) {
    throw new Error("The AI response does not contain exactly one replacement per comment.");
  }

  return parsed.replacements;
}

function parseJson(responseText: string): unknown {
  try {
    return JSON.parse(extractJsonObject(responseText));
  } catch {
    throw new Error("The AI response is not valid JSON.");
  }
}

// The agent can wrap the object in prose or Markdown fences, so find the object it asked for.
function extractJsonObject(responseText: string): string {
  for (
    let start = responseText.indexOf("{");
    start !== -1;
    start = responseText.indexOf("{", start + 1)
  ) {
    const candidate = readBalancedObject(responseText, start);

    if (candidate?.includes('"replacements"')) {
      return candidate;
    }
  }

  throw new Error("The AI response does not contain a replacement object.");
}

function readBalancedObject(text: string, start: number): string | undefined {
  let depth = 0;
  let insideString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (insideString) {
      escaped = character === "\\";
      insideString = character !== '"';
      continue;
    }

    if (character === '"') {
      insideString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function isModelResponse(value: unknown): value is ModelResponse {
  if (!isRecord(value) || !Array.isArray(value.replacements)) {
    return false;
  }

  return value.replacements.every(
    (replacement) =>
      isRecord(replacement) &&
      Number.isInteger(replacement.line) &&
      typeof replacement.code === "string" &&
      replacement.code.trim().length > 0,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
