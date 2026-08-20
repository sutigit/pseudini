import assert from "node:assert/strict";
import test from "node:test";
import { mergeReplacementFragments } from "../src/replacementMerger";

test("joins generated fragments for one large comment in request order", () => {
  assert.deepEqual(
    mergeReplacementFragments([
      { line: 8, endLine: 12, code: "  const first = prepare();" },
      { line: 8, endLine: 12, code: "  return finish(first);" },
    ]),
    [
      {
        line: 8,
        endLine: 12,
        code: "  const first = prepare();\n  return finish(first);",
      },
    ],
  );
});

test("keeps independent replacements sorted by source line", () => {
  assert.deepEqual(
    mergeReplacementFragments([
      { line: 5, code: "later();" },
      { line: 1, code: "earlier();" },
    ]),
    [
      { line: 1, code: "earlier();" },
      { line: 5, code: "later();" },
    ],
  );
});
