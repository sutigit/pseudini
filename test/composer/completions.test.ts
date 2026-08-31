import assert from "node:assert/strict";
import test from "node:test";
import {
  createSuggestions,
  hasSuggestionCandidates,
  readSuggestionPrefix,
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

test("reads the word the caret sits at the end of", () => {
  assert.equal(readSuggestionPrefix("  sum ord", 9), "ord");
  assert.equal(readSuggestionPrefix("  sum ordTotal", 9), "ord");
  assert.equal(readSuggestionPrefix("  sum ord ", 10), "");
  assert.equal(readSuggestionPrefix("  sum (ord)", 11), "");
  assert.equal(readSuggestionPrefix("  2ord", 6), "ord");
  assert.equal(readSuggestionPrefix("", 0), "");
});

test("finds candidates from the first letter of a known name", () => {
  assert.equal(hasSuggestionCandidates(["orderTotal"], ["return"], "o"), true);
  assert.equal(hasSuggestionCandidates(["orderTotal"], ["return"], "r"), true);
});

test("reports no candidates once the word deviates", () => {
  assert.equal(hasSuggestionCandidates(["orderTotal"], ["return"], "ordx"), false);
  assert.equal(hasSuggestionCandidates(["orderTotal"], ["return"], "the"), false);
});

test("reports no candidates for an empty or completed word", () => {
  assert.equal(hasSuggestionCandidates(["orderTotal"], ["return"], ""), false);
  assert.equal(hasSuggestionCandidates(["orderTotal"], ["return"], "return"), false);
  assert.equal(hasSuggestionCandidates([], [], "o"), false);
});
