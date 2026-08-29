import assert from "node:assert/strict";
import test from "node:test";
import { evaluateUndoStep } from "../../src/composer/undoHistory";

const ORIGINAL = "function total() {\n}\n";

test("stops replaying undo once the original text is back", () => {
  assert.equal(evaluateUndoStep(ORIGINAL, ORIGINAL, 12, 13), "restored");
});

test("keeps replaying undo while the document still changes", () => {
  assert.equal(
    evaluateUndoStep("function total() {\n  /*\n  sum it\n  */\n}\n", ORIGINAL, 12, 13),
    "continue",
  );
});

test("reports an exhausted undo stack when a replay changes nothing", () => {
  assert.equal(evaluateUndoStep("other text\n", ORIGINAL, 12, 12), "exhausted");
});
