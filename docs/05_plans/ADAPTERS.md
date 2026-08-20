# Adapters Package Alignment Plan

## Summary

 - Create docs/05_plans/ADAPTERS.md as the single active, planning-only document (**Authority:** Planning only., **Status:** Active, **Updated:** 2026-08-20); archive it to docs/04_archive/ when all acceptance evidence is recorded.
 - Current evidence: 227/227 adapters tests pass across 15 files; the public root surface matches spec §3 exactly in both directions (C9 internalization included and pinned by src/index.test.ts); adapter purity holds (no clock, no I/O, signature exact); all seven probed lint rules fire on their fixtures with the control silent; the fixture drift guard runs in root check:ci and CI.
 - Correct the substantive gaps: a false spec claim about Vendor B sequence synthesis, the untested and unproduced unsupported_dialect kind, five configured lint protections with no enforcement probe, an incomplete spec §4 file tree, README API omissions, and stale counts/tables inside packages/adapters/TODO.md and src/testing/README.md.
 - Decisions confirmed with the user: unsupported_dialect is documented as reserved (no producer implemented — no dialect declares a version field); enforcement gaps are closed by adding missing probes, not by narrowing the spec claim.
 - Surfaced conflict resolved toward code and ADR 1: spec §5's "its adapter synthesizes weaker ordering from the timestamp" contradicts src/vendors/b/adapter.ts:41-44 (which refuses synthesis by design), the server's disabled ordering check, and the README/registry/TODO, all of which agree with each other. The spec sentence is the outlier and is corrected; no code changes.
 - Out of scope: packages/FIXME.md internal contradictions (Authority: Historical — never normative); renaming TODO.md's local D/F ID namespaces (all items closed; a clarifying note suffices); implementing a dialect-version producer; changing the deliberately ungated coverage (ADR 22).
 - Work lands as two PRs, each under the ~300-modified-line cap: PR 1 documentation reconciliation, PR 2 enforcement probes plus count synchronization.

 ## Specification Corrections (docs/03_package-specs/02_ADAPTERS.md)

 - §5 Vendor B bullet: replace the false synthesis sentence — sequence travels as absent, the adapter refuses to synthesize a counter, and the server disables its ordering check for such robots (cite ADR 1 § Observed consequences). Keep the "never papered over with a zero" framing, which the current sentence contradicts.
 - §3: record that unsupported_dialect is contract-owned wire vocabulary with no current producer in this package, and list the four ./testing types (VendorFixture, VendorFixtureName, MalformedPayload, MalformedPayloadName) alongside the five value exports.
 - §4 tree: add core/units.ts, core/unknownFieldPaths.ts, registry.ts, testing/, the two root cross-cutting test files, and the per-vendor __fixtures__/ (recorded, generated) versus __malformed__/ (hand-authored) provenance split (ADR 13).
 - §1/§8 reconciliation: adapters are pure in their arguments except the one unknown-field ledger closed over, which the registry owns — align §1's flat "no state across calls" with §8 and core/adapter.ts:8-15.
 - §8: "the one process-wide ledger" → one ledger per registry, with one registry per process as the expected mode (two-registries-two-tallies is tested behavior, not an error).
 - §7 table and §10/§11 counts: updated in PR 2 after the new probes land.

## Documentation Reconciliation

 - packages/adapters/README.md: add an unsupported_dialect row marked reserved with no current producer; name the full root API including SUPPORTED_VENDORS, isSupportedVendor, and SupportedVendor (the type its own vendor-addition checklist edits) plus the result constructors the server uses; name the five ./testing exports; extend the lint-rule sentence to the full enforced set (boundary types, switch exhaustiveness, unsafe assertion, Node-free testing subpath).
 - packages/adapters/TODO.md: correct the §4 enforcement table from four rules to the seven that fire (it is contradicted by its own audit section); B3/C4 "21 contract tests" → 24; C6 "Twenty-five rows" → 26; Section 0 tree gains registry.ts, vendors/c/, testing/__enforcement__/, and the root test files, with "4 deliberate violations" → 5; add a one-line note that local checklist IDs (D1–D8, F1–F3) are unrelated to docs/decisions.json D-ids and packages/FIXME.md F-ids; "audited against ADRs 10-29" → 10-33.
 - packages/adapters/src/testing/README.md: fix the FIXTURE_RECORDING table to the three actual keys (seed, fleetSize, instantMs — correcting the instant spelling) and move the robot-ID row out of the "exported as" claim; remove the stale "265 tests stay green" web count rather than chasing it; repoint the closed-C5 reference to the still-true factual half only.
 - packages/adapters/AGENTS.md: delete the stale "If package scripts do not yet exist" hedge (all six scripts exist); add routing rows for src/registry.ts and the two cross-vendor evidence suites (capabilityTrace.test.ts, crossVendorNormalization.test.ts).
 - Root TODO.md: repair the dangling "their" sentence at the adapters reconciliation bullet and its now-wrong "remaining open items" claim (the adapters checklist has zero unchecked boxes; remaining work is the nine deferred ADR-open-question bullets); "ADRs 10-29" → 10-33 at line ~171.                    move volatile hard-coded test counts only where they are not dated audit evidence; counts kept are synchronized in PR 2.

## Enforcement and Test Additions

 - Add five deliberate-violation fixtures following the existing pattern in src/__enforcement__/README.md (imitate wallClock.ts and vendors/a/__enforcement__/crossVendor.ts; @ts-nocheck only where an import deliberately does not resolve):
   - src/vendors/a/__enforcement__/crossVendorAbsolute.ts — the absolute-form cross-vendor import (**/vendors/b/**), the exact ADR 7 silent no-op spec §4 warns about; only the relative form is probed today.
   - src/__enforcement__/performanceClock.ts — reads the performance global, the unprobed second entry of no-restricted-globals.
   - src/__enforcement__/webImport.ts — imports from the web/web/* restricted group; workspaceImport.ts only probes @fleet/server.
   - src/__enforcement__/explicitAny.ts — explicit any (@typescript-eslint/no-explicit-any).
   - src/__enforcement__/objectLiteralAssertion.ts — object-literal type assertion (consistent-type-assertions, objectLiteralTypeAssertions: "never").
 - Extend src/__enforcement__/enforcement.test.ts with one rule-id assertion per new fixture, keeping the single beforeAll ESLint pass (ignore: false) and the silent legal.ts control; update src/__enforcement__/README.md's inventory. Do not repair, delete, or touch existing fixtures.
 - Optional, only if the diff budget allows: add a src/vendors/c/__malformed__/ schema-rejection fixture so vendor C has a malformed_payload fixture like A and B (its inline coverage already exists); otherwise record it as deferred in docs/05_plans/ADAPTERS.md.

## Test & Acceptance Plan

 - Write the new enforcement assertions first and watch them fail before adding each fixture file (Principle 10); each new fixture must fire exactly its rule and the control must stay silent.
 - Run focused package tests (pnpm vitest run in packages/adapters; expect 16+ new assertions over the current 227, all green), then synchronize every surviving count in the same commit: spec §7/§10, packages/adapters/TODO.md Section 0 and §3, root TODO.md baseline row.
 - PR 1 gate: pnpm check:architecture-docs (spec, TODO, and new plan-file metadata), pnpm check:doc-comments; pnpm docs:decisions is not needed (no decisions.json change).
 - PR 2 gate: serial pnpm test, pnpm lint in the package, pnpm check:dependencies, pnpm check:diff-size before each commit; fixtures are untouched so record:fixtures drift cannot occur, but root check:ci is the final gate.
 - Verify each PR stays under ~300 modified lines (pnpm check:diff-size); commits are made by the user (global commit.gpgsign blocks non-interactive signing — do not commit on their behalf).
 - Archive docs/05_plans/ADAPTERS.md with the archive date and replacement evidence once both PRs land and the checks above pass; until then it remains the single Active plan for this package.
