import assert from "node:assert/strict";
import test from "node:test";
import { AimeInstruction } from "../src/commentParser";
import { createImplementationPrompt, parseModelResponse } from "../src/prompt";

const instructions: readonly AimeInstruction[] = [
  { line: 2, pseudocode: "return the sum" },
];

test("creates a prompt with file context and instructions", () => {
  const prompt = createImplementationPrompt(
    "typescript",
    "total.ts",
    "function total() {\n  // aime: return the sum\n}",
    instructions,
  );

  assert.match(prompt, /Language identifier: typescript/);
  assert.match(prompt, /File name: total\.ts/);
  assert.match(prompt, /return the sum/);
  assert.match(prompt, /function total\(\)/);
});

test("parses an exact model response", () => {
  const response = JSON.stringify({
    replacements: [{ line: 2, code: "  return values.reduce(sum, 0);" }],
  });

  assert.deepEqual(parseModelResponse(response, instructions), [
    { line: 2, code: "  return values.reduce(sum, 0);" },
  ]);
});

test("rejects missing replacements", () => {
  assert.throws(
    () => parseModelResponse('{"replacements":[]}', instructions),
    /exactly one replacement/,
  );
});

test("rejects non-JSON output", () => {
  assert.throws(
    () => parseModelResponse("```json\n{}\n```", instructions),
    /not valid JSON/,
  );
});
