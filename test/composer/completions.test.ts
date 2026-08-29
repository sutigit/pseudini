import assert from "node:assert/strict";
import test from "node:test";
import {
  createSuggestions,
  shouldTriggerComposerSuggestions,
} from "../../src/composer/suggestions";

test("ranks file identifiers before keywords and matches case-insensitively", () => {
  assert.deepEqual(
    createSuggestions(["returnValue", "record"], ["return", "readonly"], "RET"),
    [
      { label: "returnValue", source: "file" },
      { label: "return", source: "keyword" },
    ],
  );
});

test("removes duplicate and exact suggestions", () => {
  assert.deepEqual(
    createSuggestions(["order", "orderTotal"], ["order"], "order"),
    [{ label: "orderTotal", source: "file" }],
  );
});

test("opens suggestions after a typed word character, not after a newline", () => {
  assert.equal(shouldTriggerComposerSuggestions("o"), true);
  assert.equal(shouldTriggerComposerSuggestions("order"), true);
  assert.equal(shouldTriggerComposerSuggestions(" "), false);
  assert.equal(shouldTriggerComposerSuggestions(""), false);
  assert.equal(shouldTriggerComposerSuggestions("order\n"), false);
});
