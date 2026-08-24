# AGENTS.md

This package owns the boundary between untrusted vendor telemetry dialects and the canonical robot envelope defined by `packages/contracts`.

The repository-level [`AGENTS.md`](../../AGENTS.md), [`PRINCIPLES.md`](../../PRINCIPLES.md), and accepted ADRs remain binding. This file adds adapter-specific instructions; it does not replace them.

## Package responsibilities

- Decode vendor payloads at runtime and reject malformed input without coercion (Principle 2).
- Normalize genuinely shared meaning into the canonical core: identity, connectivity, battery, position, status, health, `reportedAt`, and `receivedAt`.
- Preserve genuine vendor differences through the canonical declared-capability record. Never add vendor-only fields to the canonical core or push vendor conditionals downstream (Principle 3, ADR 1).
- Count unrecognized input fields per adapter so `packages/server` can expose those counts on its health endpoint. Do not silently discard them.
- Leave raw-payload retention to `packages/server`, which retains the accepted request body for technician diagnosis without placing it in the fleet read model or WebSocket delta stream (ADR 26).

This package does not own transport, storage, freshness derivation, UI behavior, or the canonical contract. Those belong to `packages/server`, `packages/contracts`, and `packages/web` respectively.

## Required structure

- Give each vendor dialect its own module and recorded fixtures under this package.
- Keep vendor names generic (`A`, `B`, and `C`); never name a real integration partner.
- Add a new vendor by adding a module, fixtures, and contract tests here. Do not change the canonical model merely to accommodate a vendor.
- Import canonical types and schemas from `packages/contracts`; do not duplicate them locally.
- Export package consumers through the package's public entry point rather than requiring deep imports.
- Dispatch through `createAdapterRegistry()` in `src/registry.ts`. A consumer never imports a vendor module: the registry's `switch` over `SupportedVendor` is the only place vendor identity selects code, and it owns the one unknown-field ledger the process is allowed (ADR 1, ADR 15).

## Adapter contract

- Treat every adapter input as `unknown` until a vendor-specific runtime schema has decoded it.
- Produce the canonical envelope in its documented units and vocabulary. Canonical status is `idle | busy | charging | fault | unknown`; health severity remains a separate value.
- Normalize the vendor timestamp to epoch milliseconds as `reportedAt`. Accept `receivedAt` from the server boundary; do not derive or overwrite receipt time in an adapter.
- Do not derive freshness here. `packages/server` owns the sweep and calls the pure freshness function in `packages/contracts` (ADR 3).
- Declare capabilities by key presence in `Partial<Record<CapabilityName, CapabilityPayload>>`. Do not maintain a parallel capability set or emit empty placeholders.
- Every non-core output field must trace to a capability declared by that adapter.
- Preserve source semantics. If a source value cannot be mapped honestly, reject it or map it to an explicit canonical unknown state where the contract permits; never invent precision or support.
- Return failures in the package's explicit adapter result/error model. Do not throw unstructured vendor data across the boundary.
- Describe a failure in `ContractIssue` — the repository's one failure vocabulary (ADR 20). Pass a schema rejection's issues through `toContractIssues` unchanged; build a non-schema rejection's issue with `issuesForKind`, so its `code` is the rejection kind. Never flatten several bad fields into one message, and never interpolate a payload value into an issue message: these issues are serialized into an HTTP error body by `packages/server`.

## Tests and fixtures

- Prefer test-driven changes: add or update the focused contract test before implementation (Principle 10).
- Keep at least one representative recorded fixture per vendor and assert the exact canonical output.
- Cover each vendor's malformed or boundary cases, additional fields, unit conversion, timestamp conversion, status mapping, and capability presence/absence.
- Treat the documented dialect differences as load-bearing evidence:
  - Vendor A: nested payload, fractional battery, metres, ISO timestamp.
  - Vendor B: flat payload, integer battery, centimetres, epoch-millisecond timestamp, no sequence capability.
  - Vendor C: broadly A-shaped, with water level, without lidar health, and with an undocumented field that increments the unknown-field count.
- Use deterministic fixtures and injected receipt times. Do not read the wall clock in contract tests.
- Test unknown-field accounting as per-adapter state, not per-robot state.
- Avoid broad snapshots when explicit assertions better document mapping invariants.

## Change rules

- Add a new capability in `packages/contracts` first, with its payload schema and serialization behavior, then consume it here. A capability is a shared architectural change, not a vendor-local shortcut.
- Document non-trivial coupling on both sides of a cross-package change with comments naming the related module (Principle 14).
- Add a one-sentence doc comment to every class, function, and type reachable from `src/index.ts` or `src/testing/index.ts` (ADR 37). Elsewhere, comment only where the sentence says something the declaration cannot.
- Keep changes focused. Do not refactor other adapters while adding or correcting one vendor unless the shared behavior itself is the subject of the change.
- If a request conflicts with `PRINCIPLES.md` or an ADR, stop and surface the conflict rather than working around it.

## Verification

Run the narrow adapter contract tests first, then the package typecheck and lint commands, followed by the repository test command when cross-package contracts change. If package scripts do not yet exist, use the nearest repository-level commands documented in the root `README.md` or workspace configuration; do not invent undocumented local setup.

## Task routing

Read one matching row, then its narrow follow-up; do not preload sibling packages or all
adapter ADRs.

| Task                                           | Start here                             | Then narrow to                                                                                                 |
| ---------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Public exports or package status               | `packages/adapters/src/index.ts`       | `docs/03_package-specs/02_ADAPTERS.md`                                                                         |
| Implement the first or a later vendor dialect  | `docs/03_package-specs/02_ADAPTERS.md` | Confirm current status, then `src/vendors/<vendor>/adapter.ts`, its schema, fixtures, and contract test; ADR 1 |
| Adapter success/failure result shape           | `src/core/result.ts`                   | Colocated test; contracts error schema if the public shape changes                                             |
| Unknown-field path discovery or accounting     | `src/core/unknownFieldPaths.ts`        | `unknownFields.ts`, their tests, and D5 mapping in `docs/decisions.json`                                       |
| Supported vendor set                           | `src/core/vendor.ts`                   | Colocated test; simulator parity test named in D7                                                              |
| Recorded fixture access and provenance         | `src/testing/index.ts`                 | `fixtures.ts`; D2/D4 mappings                                                                                  |
| Canonical output type or payload schema        | `packages/contracts/src/index.ts`      | One matching contracts schema, never the whole package                                                         |
| Dependency, clock, or unsafe-input enforcement | `eslint.config.js`                     | `src/__enforcement__/enforcement.test.ts`                                                                      |
