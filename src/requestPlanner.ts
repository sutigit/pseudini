import { AimeInstruction } from "./commentParser";

const MAX_BATCH_WORDS = 600;
const LARGE_INSTRUCTION_PART_WORDS = 550;

export function chunkInstructions(
  instructions: readonly AimeInstruction[],
): readonly (readonly AimeInstruction[])[] {
  const expandedInstructions = instructions.flatMap(splitLargeInstruction);
  const chunks: AimeInstruction[][] = [];
  let current: AimeInstruction[] = [];
  let currentWords = 0;

  for (const instruction of expandedInstructions) {
    const words = countWords(instruction.pseudocode);
    if (current.length > 0 && currentWords + words > MAX_BATCH_WORDS) {
      chunks.push(current);
      current = [];
      currentWords = 0;
    }
    current.push(instruction);
    currentWords += words;
  }
  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function splitLargeInstruction(
  instruction: AimeInstruction,
): readonly AimeInstruction[] {
  const words = instruction.pseudocode.trim().split(/\s+/).filter(Boolean);
  if (words.length <= MAX_BATCH_WORDS) {
    return [instruction];
  }

  const parts: string[] = [];
  for (let index = 0; index < words.length; index += LARGE_INSTRUCTION_PART_WORDS) {
    parts.push(words.slice(index, index + LARGE_INSTRUCTION_PART_WORDS).join(" "));
  }

  return parts.map((part, index) => ({
    ...instruction,
    pseudocode:
      `Implementation part ${index + 1} of ${parts.length}. ` +
      "Generate only the consecutive statements for this part; do not repeat prior parts. " +
      part,
  }));
}

export function estimateMaxOutputTokens(
  instructions: readonly AimeInstruction[],
): number {
  const words = instructions.reduce(
    (total, instruction) => total + countWords(instruction.pseudocode),
    0,
  );

  if (words <= 50) {
    return 256;
  }
  if (words <= 750) {
    return 1_200;
  }
  if (words <= 2_500) {
    return 4_096;
  }
  return 8_192;
}

export function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
