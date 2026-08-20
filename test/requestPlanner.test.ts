import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkInstructions,
  estimateMaxOutputTokens,
} from "../src/requestPlanner";

test("groups instructions into bounded sequential batches", () => {
  const instructions = [
    { line: 1, pseudocode: "word ".repeat(400) },
    { line: 2, pseudocode: "word ".repeat(300) },
    { line: 3, pseudocode: "return zero" },
  ];

  assert.deepEqual(
    chunkInstructions(instructions).map((batch) => batch.map(({ line }) => line)),
    [[1], [2, 3]],
  );
});

test("selects output budgets from pseudocode size", () => {
  assert.equal(
    estimateMaxOutputTokens([{ line: 1, pseudocode: "return zero" }]),
    256,
  );
  assert.equal(
    estimateMaxOutputTokens([{ line: 1, pseudocode: "word ".repeat(500) }]),
    1_200,
  );
  assert.equal(
    estimateMaxOutputTokens([{ line: 1, pseudocode: "word ".repeat(2_000) }]),
    4_096,
  );
});

test("splits one large comment into ordered implementation parts", () => {
  const batches = chunkInstructions([
    { line: 4, endLine: 20, pseudocode: "requirement ".repeat(1_300) },
  ]);

  assert.equal(batches.length, 3);
  assert.deepEqual(
    batches.map((batch) => batch[0].line),
    [4, 4, 4],
  );
  assert.match(batches[0][0].pseudocode, /part 1 of 3/);
  assert.match(batches[2][0].pseudocode, /part 3 of 3/);
  assert.equal(batches[2][0].endLine, 20);
});
