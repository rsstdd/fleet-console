import assert from "node:assert/strict";
import { test } from "node:test";

import { checkArchitectureDocs, loadAdrs, parseAdrMetadata } from "./architectureDocs.mjs";

test("ADR metadata is strict and machine-readable", () => {
  assert.throws(() => parseAdrMetadata("# ADR 1 — Missing metadata", "bad.md"), /template/);
});

test("every numbered ADR has unique structured metadata", async () => {
  const adrs = await loadAdrs();
  assert.ok(adrs.size >= 24);
});

test("decision index, stale-language checks, and mechanical citations are consistent", async () => {
  assert.deepEqual(await checkArchitectureDocs(), []);
});
