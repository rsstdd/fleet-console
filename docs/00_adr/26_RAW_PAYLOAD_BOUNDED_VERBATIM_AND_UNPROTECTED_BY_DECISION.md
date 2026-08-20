# ADR 26 — The Raw Vendor Payload Is Bounded, Kept Verbatim, and Unprotected by Decision

**Decision:** The server caps the ingest request body at 64 KiB before parsing it, retains the latest accepted payload per robot exactly as received with no redaction, deep-copies it in both directions so retained evidence cannot be mutated, and states plainly in the ADR and in the console that the diagnostic endpoint has no access rule.
**Group:** Data / security posture (what is retained, how much, and who can read it).
**Status:** Decided · 2026-08-19 · Implemented 2026-08-20

## Issue

`GET /api/robots/:id` serves the last raw message each robot sent, so a technician can see exactly what the vendor transmitted. ADR 1 decided the separation and the endpoint placement; ADR 6 explicitly said retention lifetime and bounds were a separate question and did not answer it. Register stub **D18** was that question, and it was the last one open.

**All three gaps were already encoded in shipped code, chosen by not choosing.** `CurrentStateStore` kept one `rawPayload` per robot slot with **no byte bound and no depth bound**; `robotDiagnosticEnvelopeSchema` accepted an arbitrary `Record<string, unknown>`; and the robot-detail page printed it with `JSON.stringify`. Authentication is an explicit product cut (`README` § 9), so nothing distinguished an operator allowed to read canonical telemetry from one allowed to retrieve vendor payloads.

That combination — unbounded, unredacted, unauthenticated — is the worst of the available options, and the stub said so: it was arrived at by default rather than decided.

## Assumptions

- Raw payloads are useful _because_ they preserve what the canonical model does not understand. That is also what makes them the least predictable data the server holds.
- A vendor can send a large nested value, or a field carrying identifiers or credentials, without telling anyone. Nobody here has a catalogue of what the three dialects may contain.
- This repository is a local demonstration today. That is what makes an unauthenticated diagnostic endpoint tolerable **and** what makes it a release blocker rather than a permanent state.
- The payload reaching the store came from `JSON.parse` of a request body, so it holds no functions, symbols or cycles. `structuredClone` is safe by that precondition and not in general.

## Constraints

- **The raw payload never enters the fleet read model, history, health, logs, error bodies, or the delta stream** (ADR 1, and ADR 20 § G6 for error bodies). The types enforce most of it; tests enforce the rest.
- **ADR 6 bounds in-memory state.** Any retention decision has to produce a number that budget can be checked against.
- The cap must apply **before** JSON parsing and adapter work, or it protects nothing expensive (stub § Sequencing).
- Adding an error kind is a contracts change and stops the server compiling until it decides a status and a summary (ADR 20).

## Decision

**Option 3: bound what can be bounded, keep the bytes verbatim, and state the exposure.**

**A 64 KiB ingest cap, derived rather than picked.** The three recorded vendor fixtures are 221, 404 and 428 bytes, so the cap is roughly 150x the largest dialect anyone here actually sends. It yields an arithmetic worst case instead of a hope: retention is one payload per robot, so 500 robots x 64 KiB is **32,768,000 bytes — 31.25 MiB**.

**Two guards, because one is not enough.** `checkDeclaredSize` reads `Content-Length` and refuses before a byte is read — but that header is caller-supplied and therefore untrusted, so it is a cheap early exit and **not the enforcement**. `createByteBudget` counts actual bytes as the body streams and refuses the moment the running total crosses the cap. A client that under-declares or omits the header walks past the first guard and is stopped by the second.

**No redaction, deliberately.** Field-name redaction over a dialect nobody has catalogued offers assurance it cannot deliver: the fields you would need to name are exactly the ones you do not know about, and stripping them removes the evidence the endpoint exists to provide. Claiming redaction would be worse than not redacting, because it would be believed.

**Retained evidence is deep-copied in both directions.** The store previously spread the payload, which copies the top level only, leaving a caller's nested object able to rewrite retained evidence after the fact. `structuredClone` on the way in, and again on the way out, so neither the writer nor the reader holds a reference to what the store keeps.

**`payload_too_large` is a new error kind answering 413**, not the generic 400. The caller's remedy differs in kind — send less, rather than send it correctly — and nothing read the body, so the server has no opinion on whether it was well-formed.

**The exposure is stated, in the ADR and on the page.** The robot-detail raw-payload panel says the content is shown exactly as the vendor sent it with nothing removed, and that the view is not access-controlled. That notice is the honest half of this decision and is a release blocker, not decoration.

## Positions

1. **Byte limit plus an explicit redaction policy.** Rejected. Redaction cannot identify unknown secrets by name, and every field it does strip is evidence a technician came here for.
2. **Exact payload behind a diagnostic permission.** The right answer, and unavailable: it requires the authentication capability `README` § 9 cuts. It is where this goes the moment anything deploys.
3. **Demo-only exact payload, bounded, with the exposure stated.** Chosen.
4. **Do not retain raw payloads at all.** Rejected: it reverses ADR 1 and the robot-detail spec, and removes the only evidence for diagnosing an unmapped vendor field after the request ends.
5. **Bounded per-robot payload history.** Rejected. It multiplies both memory and sensitive-data exposure for a diagnosis case nobody has had yet, and would need its own retention and export policy.

## Argument

The decision worth defending is refusing to redact, because redaction is what a reviewer expects to see and its absence looks like an omission. It is not one. Redaction here would be a claim — "sensitive content has been removed" — that the implementation cannot support, since the dialects are only partly known and the unknown fields are precisely the ones the panel exists to reveal. A safeguard that is believed and does not work is worse than a stated absence, because it stops anyone asking the question again.

What _can_ be bounded is bytes, and bounding bytes is what makes the memory claim arithmetic rather than aspirational. That is why the cap is derived from real fixtures and why the 500-robot figure is asserted in a test: raising the cap raises retained memory linearly and silently, so the number owes a home where changing it is visible.

The two-guard structure is the other non-obvious part. It is tempting to check `Content-Length` and stop, because it is one line and rejects before any work. But that header is written by the caller, and a cap that a caller can opt out of is not a cap. The header check survives as an optimisation with a comment saying exactly that, so the next reader does not delete the budget as redundant.

## Implications

- **The ingest handler calls both guards before `JSON.parse`.** Wiring them in the wrong order — after decode — would leave the cap protecting only the store, which was never the expensive part. The live HTTP tests pin declared and streamed-body limits.
- **`structuredClone` runs once per accepted upsert**, in the ingest path, bounded by the cap. If that ever shows up in ADR 2's harness, the alternative is documenting decoded input as immutable and dropping the inbound copy — but not the outbound one.
- **`payload_too_large` demonstrated ADR 20's claim exactly.** Adding it to `ERROR_KINDS` broke `errorResponse.ts`'s two exhaustive tables at compile time, and the server could not build until it decided a status and a summary. That is the mechanism working as designed, on the first kind added after the ADR predicted it.
- **`ErrorStatus` widened to include 413.** Any consumer switching on status sees a new value; none exists yet, which is why this was cheap now.
- **The exposure notice is load-bearing text.** It is asserted by tests, including for a robot with no retained payload, because the endpoint is equally unprotected either way. Softening it to make the panel look finished would remove the only thing standing between this decision and a deployment that quietly inherits it.
- **The technician toggle is presentation, not permission**, and the ADR says so where someone might assume otherwise. It hides the panel; it authorizes nothing (Principle 7).
- **This does not become safe by being deployed carefully.** Position 2 is the successor, and the trigger is any deployment beyond the demo, not a judgement about the network it lands on.

## Open questions

- **Does the cap belong per route rather than per server?** Ingest is the only body-taking route today. A future command endpoint might warrant a different limit, at which point `MAX_INGEST_BYTES` is the wrong name.
- **Should the retained payload be capped separately from the request?** They are the same bound today because retention is the accepted body. A future batched ingest (ADR 2's first mitigation) breaks that identity — one request would carry many robots' payloads — and the retention bound would need restating per robot rather than per request.
- **What happens to retained payloads on restart?** They vanish with the process, like all in-memory state (ADR 6). That is a privacy property nobody chose deliberately, and it is worth noticing before anyone adds persistence for another reason.

## Observed consequences

- 19 August 2026: implemented. `packages/server` gained `src/ingest/requestSizeLimit.ts` (13 tests) and the `payload_too_large` status/summary; `CurrentStateStore` deep-copies in both directions (6 new tests); `packages/contracts` gained the error kind; `packages/web` gained the exposure notice (3 tests). Server 76 → 97 tests, web 204 → 207.
- **A defect was found by writing the test in only one direction.** The inbound deep copy was landed first, and the test asserting a _reader_ cannot mutate retained evidence failed: `diagnostic()` was still returning the live reference. The store had a private copy and handed it straight out. Fixed by copying on read as well, and the function renamed from `retainPayload` to `copyPayload` to stop implying it runs once.
- **The 500-robot arithmetic was wrong on the first attempt** and the test caught it: 500 x 64 KiB is 31.25 MiB, not 32 MiB. The figure now appears in the source comment, the ADR and an assertion, so the three cannot drift.
- The boundary-enforcement suites flaked twice more during this work (`packages/server`'s, both times), passing in isolation and on re-run. That is the fourth and fifth occurrence recorded; see `packages/FIXME.md` **F14**.

## Related

- **ADR 1** (adapter boundary) — decided that the raw payload is separated from the fleet model and served only from the single-robot endpoint. This ADR answers the lifetime, bound and access questions it left open.
- **ADR 6** (bounded in-memory history, no database) — explicitly deferred raw-payload retention to this decision, and supplies the memory budget the 31.25 MiB figure is checked against.
- **ADR 20** (one issue vocabulary end to end) — predicted this ADR's error kind by name in its Implications, and its exhaustive tables are what forced the status and summary to be decided rather than defaulted.
- **ADR 2** (HTTP ingest, WebSocket fan-out) — owns the batching mitigation that would break the request-equals-retention identity noted in Open questions.
- **ADR 8** (server transport) — owns the implemented ingest handler that calls these guards in the required order.
- **Register D18** — resolved by this ADR; it was the last open stub.
- **Principle 7** (the UI never authorizes) — the reason the technician toggle is named as presentation rather than allowed to read as a permission.
- **Principle 12** (performance is product behaviour, budgets are measured) — the reason the cap is derived from real fixture sizes and its consequence asserted as arithmetic.
