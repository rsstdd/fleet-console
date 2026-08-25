# ADR 20 — One Issue Vocabulary End to End, With the HTTP Error Body Defined in Terms of `ContractIssue`

**Decision:** A decode failure is described by `ContractIssue` at every hop — the adapter's `AdapterError` carries `readonly issues: readonly ContractIssue[]`, the server's HTTP error body is a designed envelope in `packages/contracts` whose `issues` field is those same values copied unchanged, and the console renders `path` and `code` from them.
**Group:** Integration / data (the failure half of ADR 1's adapter boundary and ADR 2's ingest contract).
**Status:** Decided · 2026-08-19 · Partial

## Issue

Three surfaces have to describe one event. When a payload fails to decode, the adapter that rejected it, the server that counts it and answers the request, and the console that tells a technician what happened each need a way to say what was wrong. Register stub **D16** recorded that all three were planning their own wording and none was ratified.

The concrete state was three shapes and two translation points. `packages/adapters` **A8** proposed building `AdapterError` on the contract's issue shape, because the shipped `AdapterError` flattened a failure into one `message` plus one optional `path` — and a vendor payload wrong in three fields arrives at the server's malformed-ingest metric as one string. `packages/server` **D4** required only "a defined error shape carrying no vendor payload contents", with no shape defined. `packages/web` **W-6** already rendered `issue.path` and `issue.code` in its terminal error state, with the coupling recorded at contracts **C-4** — so the console had, in effect, already chosen a vocabulary that nothing upstream spoke.

Ordering forced the decision now rather than later. `packages/server` already declares `@fleet/adapters`, so changing `AdapterError` was free while no ingest handler consumed it and a breaking cross-package change the moment one did. **D16** was the only open stub whose cost rose sharply with delay.

## Assumptions

- The console's technician-facing terminal state is the audience that needs per-field detail. An operator sees a connection banner; a technician diagnosing an integration wants to know which field the vendor got wrong.
- The consumers of an error body are this repository's own console and whoever is holding a terminal during an integration. There is no third-party API consumer who must be kept from seeing internal field paths — that is exactly the falsifier recorded below.
- Zod's issue messages describe the expectation, not the received value ("expected string, received number"). Verified against Zod 4.4.3 for the codes the canonical and vendor schemas can produce.
- Adding an error kind later is more likely than removing one. The vocabulary is designed to grow additively.

## Constraints

- No vendor payload content may appear in an error body, a log line, or a health response (`packages/server` **D4**, **G6**).
- `packages/contracts` may hold no HTTP status and no operator copy; mapping a failure onto a response belongs to the server, and onto a sentence belongs to the console (contracts AGENTS.md § Dependency boundary).
- `packages/adapters` may import `@fleet/contracts` and nothing else from the workspace (its lint allow-list), and its own explicit result model stays (adapters AGENTS.md § Adapter contract).
- Anything crossing the network is decoded, never trusted (Principle 2). An error body is untrusted input to the console like any other response.
- The vendor schemas do not exist yet (**B1**–**B3**), so the evidence available today is structural rather than per-vendor.

## Decision

**One vocabulary.** `ContractIssue` — `path`, `code`, `message` — is the repository's single description of a decode failure. `AdapterError` becomes `{ kind, vendor, issues }`; `message` and `path` are gone from it. A vendor schema failure passes `toContractIssues(error)` through unchanged.

**The HTTP body is designed, and defined in terms of the issue.** `errorEnvelopeSchema` in `packages/contracts` is a strict object:

```
{ schemaVersion, error: { kind, message, issues: ContractIssue[] } }
```

It is not a leaked internal type and not a parallel vocabulary. `contractIssueSchema` gives the issue a runtime schema so the console decodes an error body rather than trusting it, and a compile-time assertion holds the schema and the `ContractIssue` interface to the same field set.

**The kind vocabulary is owned by contracts, and the adapter's is a subset.** `ADAPTER_ERROR_KINDS` is `malformed_payload | unmappable_value | unsupported_dialect`; `ERROR_KINDS` is those three plus `unsupported_vendor`, `not_found` and `internal`. `packages/adapters` re-exports its kind type from contracts. The server therefore copies `kind` across the hop; there is no map from adapter kinds to wire kinds, and a compile-time assertion fails if the subset relation is broken.

**Status is coarse, `kind` is fine.** `errorResponse(kind, issues)` in `packages/server` owns the status and a fixed per-kind summary. Payload-level rejections are 400 whatever the kind, an unsupported vendor is 404 with its own counter (ADR 8 § Implications), `not_found` is 404 and `internal` is 500. A consumer needing the finer answer switches on `kind` rather than on an invented status vocabulary. The summary strings are constants — nothing derived from a request can reach them.

**No vendor content travels, by construction rather than by filtering.** A `ContractIssue` holds a path, a category, and a schema-derived message; it holds no rejected value, so there is nothing to redact. Field _names_ do travel — that is the per-field detail the console renders. The corresponding rule for adapters is written at `issuesForKind`: never interpolate a payload value into an issue message.

**The unrecognized-key gap is closed.** ADR 10 § Observed consequences recorded that `ContractIssue` flattened Zod's `unrecognized_keys` key list into the message, so a test had to read the raw Zod error. `toContractIssues` now expands that one Zod issue into one issue per key, with the key in the `path` (`freshness`, `core.unexpected`). The vocabulary keeps three fields for every code; the detail arrives as more issues rather than as a code-specific extra field.

## Positions

1. **One issue vocabulary end to end.** Chosen. Adapter failures, ingest metrics and the console's terminal state all speak `path` + `code`, and the HTTP body embeds the same issues in a designed envelope.
2. **Adapters keep a flat error; the server re-derives detail.** Each layer owns its own error shape and maps between them. Rejected: per-field detail is already gone by the time the metric counts it, and two vocabularies stay aligned by review rather than by types. The independent-evolvability it buys is not worth anything here — a change to the failure shape is a coordinated change across three packages either way, and this way the compiler says so.
3. **A separate HTTP error contract, distinct from both adapter results and issues.** Rejected as a third shape, but its concern was adopted rather than dismissed: see the argument below.

Two smaller alternatives were considered and rejected inside position 1. Giving `ContractIssue` a code-specific optional field (`keys` for `unrecognized_keys`) would make the vocabulary's shape vary by code, which is the thing a single vocabulary exists to avoid; expanding into one issue per key gets the same detail with a uniform shape. And a distinct HTTP status per kind (422 for `unmappable_value`, say) was rejected because it duplicates in the status line a distinction `kind` already carries precisely.

## Argument

The console already renders `path` and `code`. That is the fact that settles it: a vocabulary was already in use at the surface that matters, and the only question was whether the two hops upstream would speak it or translate into it. Translation is where detail disappears — not visibly, but as a `message` string that used to be three issues.

The cost of the choice is a dependency, and it is one `packages/adapters` was taking anyway. **A7** was already on that package's list because an adapter returns `AdapterEnvelope` (ADR 10); this decision only meant taking it now rather than after three vendor modules existed. The other cost — the contract issue shape becoming console copy — is real but already paid: contracts **C-4** has recorded since the console was written that `ContractIssue` is stable enough to render.

Position 3's real concern is that an HTTP error body should be designed rather than leaked from an internal type, and that the "no payload contents" rule needs an enforceable home. Both are satisfied by `errorEnvelopeSchema`: it is a designed envelope with its own version, its own kind vocabulary and its own strictness, which happens to carry issues as its detail. Inventing a parallel per-field shape alongside `ContractIssue` would have bought the same design property and added a third thing to keep aligned. What position 3 was protecting is a property of the envelope, not a reason for a second vocabulary.

The kind subset is the part that makes "no translation" mechanical rather than aspirational. If adapters owned their own kind strings, the server would need a map, and the first kind added on one side without the other would be a runtime surprise. With `AdapterErrorKind` narrowed out of `ERROR_KINDS`, the copy either compiles or it does not.

## Implications

**The roadmap half. Each item is work this decision creates, a constraint it imposes, or a property it now guarantees.**

- **`packages/adapters` now depends on `@fleet/contracts` (A7), and `AdapterError` no longer has `message` or `path` (A8).** Both items are closed. Any code written against the old two-field error changes; nothing outside this package had been, which is why the ordering mattered.
- **Vendor modules B1–B3 inherit the failure shape.** A schema rejection is `failure({ kind: "malformed_payload", vendor, issues: toContractIssues(parsed.error) })`. A judgement call with no Zod error behind it — an unmappable status code, an unsupported dialect version — uses `issuesForKind`, so the synthesized `code` is the kind rather than three vendors' invented strings. **C5**'s "a source value with no honest mapping is a rejection" now has a concrete shape to reject with.
- **Never interpolate a payload value into an issue message.** The no-leak guarantee is structural for everything the schemas generate, but a custom Zod message written by a vendor module author could break it. The rule is stated on `issuesForKind` and asserted by a test that serializes a body built from a payload containing a distinctive secret.
- **The server's malformed-ingest metric can now count at field scope if it wants to.** It counts requests today (**D4**); the issues are there to break that down per field or per code without another contract change. Whether it should is a separate call — ADR 15's warning about counters that mean less than their name says applies.
- **`errorResponse` is the only place an error body is built.** The ingest handler (**D1**–**D4**), the read endpoints (**G5**), and the raw-diagnostic endpoint (**D7**) all answer through it. A handler constructing its own body is a second authority (Principle 1) and would escape the no-leak test.
- **A new error kind is a contracts change, and deliberately so.** Adding one is additive — no consumer renames anything — but the exhaustive `Record<ErrorKind, …>` tables in `errorResponse.ts` stop compiling until the server has decided the new kind's status and summary. Register **D18**'s request-size cap is the next likely arrival.
- **`packages/web` renders from `kind` and `issues`, never from `message`.** The envelope's `message` is a server-authored line for logs and non-console callers. Operator copy stays in the console (**W-6**, `describeIssues`), where tenant wording and Principle 5's complete state set live. When the transport lands, the console must decode the body with `parseErrorEnvelope` rather than construct a message from an HTTP status.
- **`IngestRejectionReason` is narrowed out of `ErrorKind`.** The vendor selector's rejection reason and the `kind` on the wire are now the same value rather than two strings that agree by review.
- **The console's bundle does not take the new schema.** Contracts **C-5** asks for the number rather than an assumption; it is zero today and will not stay zero once the console decodes a real error body. Measured below.
- **ADR 10's recorded gap is closed rather than inherited.** Its test now asserts on the contract issue's `path`, so no test in the repository reaches past `toContractIssues` into a raw Zod error.

## Open questions

- **Should the malformed-ingest counter break down by issue `code` or `path`?**
  _Current lean:_ not yet. A per-field breakdown is genuinely useful during an integration and genuinely unbounded in a hostile case, and ADR 15's ledger already shows what a bounded-cardinality decision costs to make later.
  _Resolves on:_ the ingest handler landing, or the first integration where "which field" is the question the metric could not answer.
- **Does an error body ever need to carry a retry hint or a request id?**
  _Current lean:_ no while the console and the simulator are the only callers; both retry on their own schedule. Either would be an additive field on a strict schema, so it is a versioned change rather than a free one.
  _Resolves on:_ the first operator asking "which request was that?" against a real log.
- **Does the summary `message` earn its place?**
  _Current lean:_ yes, for `curl` and for logs — but it is the field most likely to be misused as operator copy. If the console is ever seen rendering it, that is a defect, not a shortcut.
  _Resolves on:_ the transport landing and the terminal state being built against a real body.

## Observed consequences

- 19 August 2026: implemented across three packages and green — contracts at 131 tests, adapters at 41, server at 54, and `packages/simulator` and `packages/web` unchanged and passing. `packages/adapters` took its `@fleet/contracts` dependency in the same change, closing **A7** and **A8** together.
- 19 August 2026: the decision's central property is asserted rather than asserted-to-be-true. `errorResponseForAdapterError` is tested against a payload wrong in three fields, and the response body carries three issues with the three field names — the case where position 2's re-derivation would have produced one sentence.
- 19 August 2026: the no-leak property was tested against Zod rather than assumed. A payload whose values are distinctive (`sk-live-…`) produces a body containing none of them, while the offending field _names_ are present. Zod 4.4.3's messages name the expectation and not the received value for `invalid_type`, `invalid_format`, `too_big` and `invalid_value`; the test is what would notice if that changed.
- 19 August 2026: expanding `unrecognized_keys` per key removed the last place a test read a raw Zod error, which was the gap ADR 10 § Observed consequences had deferred to this decision.
- 19 August 2026: measured against contracts **C-5** by building `packages/web` with and without the barrel's errors export: **568.65 kB raw / 174.90 kB gzip either way**, down to an identical output hash. Nothing in the console references the module yet, so it is tree-shaken whole. The number to re-measure is the one after `parseErrorEnvelope` is wired into the transport, not this one.

## Related

- `ADR 1 — decided the adapter boundary and that malformed payloads are rejected rather than coerced; this ADR decides what a rejection looks like as it travels.`
- `ADR 8 — fixed the unsupported-vendor 404 and its separate counter; the kind vocabulary and the status table here inherit that distinction.`
- `ADR 10 — settled the adapter's success shape (AdapterEnvelope) and deferred the issue-shape gap to this ADR; this one settles the failure shape, and closes that gap.`
- `ADR 15 — the malformed-ingest counter these issues will feed, and the reason a counter must mean exactly what its name says.`
- `Principle 1 (one authoritative implementation) — the reason there is one failure vocabulary and one place an error body is built.`
- `Principle 2 (external contracts are decoded once, at the boundary) — the reason the error body has a schema instead of being trusted JSON.`
- `Principle 5 (every asynchronous surface defines its complete visible state) — the console's terminal error state is what this vocabulary is for.`
- `Principle 14 (one auditable authority) — the reason the contracts issue shape is shared rather than described independently at each consumer.`
- `Artifact packages/contracts/src/errors/errorEnvelopeSchema.ts — the error envelope, the kind vocabulary, and the issue's runtime schema.`
- `Artifact packages/contracts/src/shared/primitives.ts — ContractIssue and toContractIssues, including the per-key expansion.`
- `Artifact packages/adapters/src/core/result.ts — AdapterError on the issue shape, and issuesForKind.`
- `Artifact packages/server/src/ingest/errorResponse.ts — the only place an HTTP error body is built.`
- `Artifact packages/web/src/entities/robot/useRobotDetail.ts — describeIssues, the console side of the coupling recorded at contracts C-4.`
- `docs/PENDING_ARCHITECTURE_DECISIONS.md D16 — the stub this ADR resolves.`

## Notes

- 19 August 2026: **the implications in short.** One vocabulary, three hops, no translation. `AdapterError` is `{ kind, vendor, issues }`; the HTTP body is `{ schemaVersion, error: { kind, message, issues } }`; the console renders `path` and `code` and writes its own sentence. The adapter's kinds are a subset of the wire's, so the server copies rather than maps, and the compiler enforces it. Status is coarse and `kind` is fine — 400 for any bad payload, 404 for an unintegrated vendor. Nothing a vendor sent can appear in an error body, because an issue holds no values; field names do travel, and that is the point. The costs accepted: `packages/adapters` now depends on `@fleet/contracts`, a new error kind is a contracts change, and the issue shape is now load-bearing for console copy.
- 19 August 2026: this ADR is **Partial** for the same reason ADR 10 is. Its structural evidence is shipped and tested; the two pieces of evidence **D16** asked for that need packages not yet written — a malformed fixture per vendor producing per-field issues at ingest, and the console's terminal state rendered from a real HTTP body — arrive with **B1**–**B3** and the transport. Do not mark it Implemented before both exist.
