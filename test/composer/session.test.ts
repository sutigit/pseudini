import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustComposerRange,
  beginGeneration,
  createComposerSession,
  updateComposerRange,
} from "../../src/composer/session";

test("creates a one-line composing session", () => {
  assert.deepEqual(createComposerSession("file:///example.ts", 4, "  "), {
    documentUri: "file:///example.ts",
    phase: "composing",
    range: { startLine: 4, endLineExclusive: 5 },
    indentation: "  ",
  });
});

test("grows and shrinks the region for changes inside it", () => {
  const initial = createComposerSession("file:///example.ts", 4, "  ");
  const grown = updateComposerRange(initial, 4, 4, 3);
  assert.equal(grown?.range.endLineExclusive, 7);

  const shrunk = updateComposerRange(grown!, 4, 6, 1);
  assert.equal(shrunk?.range.endLineExclusive, 5);
});

test("rejects changes outside the region", () => {
  const session = createComposerSession("file:///example.ts", 4, "  ");
  assert.equal(updateComposerRange(session, 3, 3, 1), undefined);
  assert.equal(updateComposerRange(session, 5, 5, 1), undefined);
});

test("moves from composing to pending once", () => {
  const pending = beginGeneration(
    createComposerSession("file:///example.ts", 4, "  "),
  );
  assert.equal(pending.phase, "pending");
  assert.throws(() => beginGeneration(pending), /already generating/);
});

test("adjusts both range boundaries after a foreign edit", () => {
  const session = createComposerSession("file:///example.ts", 4, "  ");
  assert.deepEqual(adjustComposerRange(session, 2, 3).range, {
    startLine: 6,
    endLineExclusive: 8,
  });
});
