# TODO — decisions this package must absorb before the end-to-end path can close

**Authority:** Planning only. This joining checklist is non-normative; accepted ADRs and current package specifications govern conflicts.

**Created:** 19 August 2026
**Owner:** the session implementing the end-to-end contract path (`packages/contracts/TODO.md` § 10, last item).
**Status:** C-1 done (ADR 10, 19 August 2026); the rest not started, because `packages/adapters` still has no vendor modules for the join.

Separate from [`TODO.md`](./TODO.md) on purpose: that file was being written while these
decisions were made, and a second writer appending to a 20 KB checklist loses work.
Fold these items into it when the bootstrap settles.

Each item states what was decided or assumed, what was rejected, and what would
falsify it. An assumption nobody can check later is a guess with better formatting.

---

## C-1 — DONE 19 August 2026 · ratified as [ADR 10](../../docs/00_adr/10_PRE_FRESHNESS_ADAPTER_ENVELOPE.md) — an adapter cannot produce a `CanonicalEnvelope`, so this package names the shape it _can_ produce

`canonicalEnvelopeSchema` requires `freshness`, and ADR 3 gives that field to the
server's sweep alone. An adapter therefore has no legal way to build an envelope
today: it would have to invent a freshness value to satisfy the schema, which is
exactly what ADR 3 and Principle 1 forbid.

**Decided:** add `adapterEnvelopeSchema` — every envelope field except `freshness` —
with its inferred type, and widen `withFreshness` to accept it and return a
`CanonicalEnvelope`. "An adapter never asserts freshness" becomes a type error
rather than a rule in a document.

**Rejected:** (a) adapters emitting `freshness: "live"` as a placeholder — a second
authority for the one field ADR 3 centralises; (b) leaving the intermediate
unmodelled and having the server assemble from loose parts — workable, but the
value crossing the adapter boundary then has no schema, which is the thing this
package exists to prevent.

**Falsified if:** `packages/server`'s ingest turns out to assemble the envelope from
core + identity + capabilities rather than receiving a whole pre-freshness value.
Then this type is ceremony and the loose-parts shape is right. Check the ingest
design before writing it.

**Must land before:** adapters `C2`/`C3`/`C4`, or all three vendor adapters get
written against a return type that then changes.

**Landed.** `adapterEnvelopeSchema`, `AdapterEnvelope` and `parseAdapterEnvelope`
are exported, `withFreshness` accepts either shape, and the two field lists are
derived from one so they cannot drift. The falsifier above is now ADR 10's first
open question and still applies: check the ingest design before writing the
handler. The status stays **Partial** until an adapter contract test and a server
ingest test exist — neither package can host one yet.

## C-2 — ASSUMPTION: `withFreshness` stays the only place freshness is set

Widening its input keeps that true; adding a second constructor that takes a
freshness argument would quietly reopen the question. If a second one appears,
this assumption is broken and ADR 3's guarantee weakens to a convention.

## C-3 — ASSUMPTION: `SCHEMA_VERSION` stays `"1"` across the join

The end-to-end fixture pins it. A bump breaks that test loudly, which is the
intended behaviour — a coordinated consumer change is what a version bump means
here — but whoever bumps it should expect the failure rather than treat it as
unrelated breakage.

## C-4 — ASSUMPTION: `ContractIssue` is stable enough to render

`packages/web` puts `issue.path` and `issue.code` into the terminal error state a
technician reads when a response fails to decode. That is a deliberate use of the
"stable failure category" this package promises. Changing the issue shape changes
console copy; the coupling is documented on the web side in
`entities/robot/useRobotDetail.ts` (`describeIssues`).

**Ratified 19 August 2026 by [ADR 20](../../docs/00_adr/20_ONE_ISSUE_VOCABULARY_END_TO_END.md),
and now load-bearing in one more place.** `ContractIssue` is the repository's single
failure vocabulary: adapters carry it, the HTTP error body (`errorEnvelopeSchema`)
carries it unchanged, and the console renders it. It has a runtime schema
(`contractIssueSchema`) held to the interface by a compile-time assertion, so the
assumption is now checked rather than believed. What remains an assumption is the
rendering half: when the transport lands, the console must decode the body with
`parseErrorEnvelope` and compose its own sentence from `kind` and `issues` — never from
the envelope's server-authored `message`.

## C-5 — RECORDED COST: this package is now in the browser bundle

Decoding at the client boundary (Principle 2) put Zod in `packages/web`: 491.70 kB
→ 567.32 kB raw, 154.33 → 175.01 kB gzip. Not an accident and not free.

**The budget this asked for now exists** — 19 August 2026,
[ADR 22](../../docs/00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md)
(register D17): 720 kB raw / 300 kB gzip of first-load JavaScript and CSS, derived
from a warehouse tablet on shared site Wi-Fi, enforced by `scripts/checkBundleBudget.mjs`
in CI. Zod's contribution sits inside it with room to spare, so Principle 2's cost is
priced rather than merely recorded, and nobody has to re-measure by hand: the build
fails if the console stops fitting. The E2E work no longer needs to remember to check
this, but note the gate measures JS **and** CSS at gzip level 9, so its number is
slightly above the JS-only figure Vite prints.
