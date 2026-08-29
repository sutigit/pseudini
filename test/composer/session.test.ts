import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustComposerRange,
  beginGeneration,
  clampToComposerContent,
  createComposerSession,
  isComposerContentLine,
  readComposerWrapperLines,
  updateComposerRange,
} from "../../src/composer/session";

test("creates a wrapped one-line composing session", () => {
  assert.deepEqual(createComposerSession("file:///example.ts", 4, "  "), {
    documentUri: "file:///example.ts",
    phase: "composing",
    range: { startLine: 4, endLineExclusive: 7 },
    contentRange: { startLine: 5, endLineExclusive: 6 },
    indentation: "  ",
  });
});

test("grows and shrinks the region for changes inside it", () => {
  const initial = createComposerSession("file:///example.ts", 4, "  ");
  const grown = updateComposerRange(initial, 5, 5, 3);
  assert.equal(grown?.range.endLineExclusive, 9);
  assert.equal(grown?.contentRange.endLineExclusive, 8);

  const shrunk = updateComposerRange(grown!, 5, 7, 1);
  assert.equal(shrunk?.range.endLineExclusive, 7);
  assert.equal(shrunk?.contentRange.endLineExclusive, 6);
});

test("rejects changes outside the editable content", () => {
  const session = createComposerSession("file:///example.ts", 4, "  ");
  assert.equal(updateComposerRange(session, 4, 4, 1), undefined);
  assert.equal(updateComposerRange(session, 6, 6, 1), undefined);
  assert.notEqual(updateComposerRange(session, 5, 5, 1), undefined);
});

test("identifies only editable content lines", () => {
  const session = createComposerSession("file:///example.ts", 4, "  ");
  assert.equal(isComposerContentLine(session, 4), false);
  assert.equal(isComposerContentLine(session, 5), true);
  assert.equal(isComposerContentLine(session, 6), false);
});

test("reports the hidden delimiter lines", () => {
  const session = createComposerSession("file:///example.ts", 4, "  ");
  assert.deepEqual(readComposerWrapperLines(session), [4, 6]);
});

test("moves the caret off hidden delimiters into the content", () => {
  const session = createComposerSession("file:///example.ts", 4, "  ");
  assert.deepEqual(clampToComposerContent(session, 4), {
    line: 5,
    edge: "start",
  });
  assert.deepEqual(clampToComposerContent(session, 6), {
    line: 5,
    edge: "end",
  });
  assert.equal(clampToComposerContent(session, 5), undefined);
  assert.equal(clampToComposerContent(session, 9), undefined);
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
  const adjusted = adjustComposerRange(session, 2, 3);
  assert.deepEqual(adjusted.range, {
    startLine: 6,
    endLineExclusive: 10,
  });
  assert.deepEqual(adjusted.contentRange, {
    startLine: 7,
    endLineExclusive: 9,
  });
});
