import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkLines,
  createWholeFilePrompt,
  parseWholeFileResponse,
} from "../src/wholeFile";

test("splits a pseudocode file into bounded line chunks", () => {
  const source = Array.from({ length: 120 }, (_, line) => `line ${line + 1}`).join("\n");
  const chunks = chunkLines(source, 50);

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].split("\n").length, 50);
  assert.equal(chunks[2].split("\n").length, 20);
});

test("does not create an empty chunk for a trailing newline", () => {
  const source = `${Array.from({ length: 50 }, () => "step").join("\n")}\n`;

  assert.equal(chunkLines(source, 50).length, 1);
});

test("includes preceding generated context in later chunk prompts", () => {
  const prompt = createWholeFilePrompt(
    "typescript",
    "workflow.ts",
    "validate the user",
    1,
    3,
    "export const prior = true;",
  );

  assert.match(prompt, /chunk 2 of 3/);
  assert.match(prompt, /export const prior = true/);
  assert.match(prompt, /validate the user/);
});

test("parses whole-file structured output", () => {
  assert.equal(
    parseWholeFileResponse('{"code":"export const value = 1;"}'),
    "export const value = 1;",
  );
  assert.equal(
    parseWholeFileResponse(
      'Generated result:\n```json\n{"code":"export const wrapped = true;"}\n```',
    ),
    "export const wrapped = true;",
  );
  assert.throws(() => parseWholeFileResponse("{}"), /invalid/);
});
