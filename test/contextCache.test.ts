import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { ContextCache } from "../src/contextCache";
import { buildFileFacts } from "../src/fileContext";

test("stores and reads facts only for the expected content hash", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "pseudini-cache-"));

  try {
    const cache = new ContextCache(workspace);
    const facts = buildFileFacts("function total() {}", "typescript", "total.ts");

    await cache.write("src/total.ts", facts);

    assert.deepEqual(await cache.read("src/total.ts", facts.contentHash), facts);
    assert.equal(await cache.read("src/total.ts", "stale-hash"), undefined);

    const manifest = JSON.parse(
      await readFile(
        path.join(workspace, ".cursor", "pseudini", "cache-v1", "manifest.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.entries["src/total.ts"].contentHash, facts.contentHash);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
