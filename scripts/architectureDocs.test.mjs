import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  checkArchitectureDocs,
  loadAdrs,
  loadPlans,
  parseAdrMetadata,
  parsePlanMetadata,
  validateDecisionRouting,
} from "./architectureDocs.mjs";

test("ADR metadata is strict and machine-readable", () => {
  assert.throws(() => parseAdrMetadata("# ADR 1 — Missing metadata", "bad.md"), /template/);
});

test("active plan metadata is strict and machine-readable", () => {
  assert.deepEqual(
    parsePlanMetadata(
      "# Work\n\n**Authority:** Planning only.\n**Status:** Active\n**Updated:** 2026-08-20\n",
      "WORK.md",
    ),
    { status: "Active", updated: "2026-08-20", trigger: null, file: "WORK.md" },
  );
  assert.throws(
    () => parsePlanMetadata("# Work\n\n**Authority:** Planning only.\n", "WORK.md"),
    /plan metadata/,
  );
});

test("trigger-deferred plans require an explicit activation condition", () => {
  assert.throws(
    () =>
      parsePlanMetadata(
        "# Work\n\n**Authority:** Planning only.\n**Status:** Trigger-deferred\n**Updated:** 2026-08-20\n",
        "WORK.md",
      ),
    /Trigger-deferred.*Trigger/,
  );
});

test("the plan template is not treated as an executable plan", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "fleet-plan-template-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const plans = path.join(root, "docs", "05_plans");
  await mkdir(plans, { recursive: true });
  await Promise.all([
    writeFile(path.join(plans, "00_TEMPLATE.md"), "# Plan title\n\n**Updated:** YYYY-MM-DD\n"),
    writeFile(
      path.join(plans, "WORK.md"),
      "# Work\n\n**Authority:** Planning only.\n**Status:** Active\n**Updated:** 2026-08-20\n",
    ),
  ]);

  assert.deepEqual(await loadPlans(root), [
    { status: "Active", updated: "2026-08-20", trigger: null, file: "WORK.md" },
  ]);
});

test("decision routing separates open next steps from resolved ADR mappings", () => {
  assert.deepEqual(
    validateDecisionRouting([
      { id: "D1", question: "Open", adr: null },
      { id: "D2", question: "Done", adr: 2, next: "stale" },
    ]),
    [
      "D1 is open and must declare a non-empty next step.",
      "D2 is resolved and must remove its open-stub next step.",
    ],
  );
});

test("superseded ADR metadata names the replacement ADR", () => {
  assert.throws(
    () =>
      parseAdrMetadata(
        "# ADR 1 — Old\n\n**Decision:** Retire this.\n**Status:** Superseded · 2026-08-20 · Implemented\n",
        "01_OLD.md",
      ),
    /Superseded by/,
  );
});

test("every numbered ADR has unique structured metadata", async () => {
  const adrs = await loadAdrs();
  assert.ok(adrs.size >= 24);
});

test("decision index, stale-language checks, and mechanical registrations are consistent", async () => {
  assert.deepEqual(await checkArchitectureDocs(), []);
});
