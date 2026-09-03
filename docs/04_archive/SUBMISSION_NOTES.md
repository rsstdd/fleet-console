# Submission notes

**Authority:** Historical only. Nothing here decides anything; the ADRs do.
**Archived:** 2026-08-20
**Superseded by:** Current ADRs, `README.md`, `TODO.md`, and the author's external
AI-authorship and review record.

**Coverage: ADRs 1–6 only, of thirty-three.** ADRs 7 and 9 are toolchain mechanics and carry
no evaluation angle. ADR 8 now has a running listener, ingest/read routes, and WebSocket
fan-out; its remaining partial status is about deferred transport policy and measurement,
not a missing process. ADRs 10–33 were written after this file and have not been given
entries; each already states its own falsifier and observed consequences, which is most of
what these notes were doing by hand. Read the absence of a section here as "not yet written",
never as "nothing to say about that decision". The current project status belongs in the
root README and TODO, not in these deliberately narrow evaluator notes.

The ADRs under `docs/00_adr/` are engineering records. They are written for whoever maintains this code, and they should read that way whether or not an evaluation is attached to them.

This file holds the material that is genuinely about the evaluation: what a given decision is meant to demonstrate, which answers are prepared for the follow-up call, and where the project schedule shaped a technical choice. Keeping it here rather than inside the ADRs stops the records from arguing for themselves.

Two references stay inside the ADRs because the decision does not stand without them:

- **ADR 1, Position 1.** The challenge's framing — a universal schema that flattens capability differences "deletes the product" — is the direct source of the rejection, not a supporting flourish.
- **ADR 5, Argument and Related.** The stated pain point, inconsistency in practice rather than in intent, is the business justification for the enforcement half of the decision.

---

## ADR 1 — Adapter boundary, canonical core plus declared capabilities

Multi-manufacturer normalization is the core of the domain, so this decision is the one most directly read as evidence of domain understanding rather than generic engineering competence. A capability model that reads as generic here undercuts the central claim more than a shortcut elsewhere in the data layer would.

Vendors are named A, B, and C, and fixtures and documentation stay generic, so the resemblance to the real multi-vendor problem reads as informed analysis rather than a guess at internals.

If a vendor is cut under schedule pressure, the intended order drops the one overlapping most with another (A and C share the most), preserving the most distinct dialect.

## ADR 2 — Transport

The Rust/Axum/Tokio path is recorded in Position 5 so it is available as a precise answer in the follow-up call rather than improvised. It was rejected here for two reasons: it contradicts the same-day TypeScript-monorepo decision, and it moves none of the rubric differentiators the submission is graded on.

The README's "not built" table should name both the broker/MQTT decision and the staged mitigation path. Both are places where the work demonstrates knowing the next step without having taken it, which is only visible if written down.

The measurement harness must publish the degradation point rather than only favourable numbers at the primary scale point.

## ADR 3 — Freshness on a server timer

The demo script's fault-injection sequence is a real artifact of the repository, not an evaluation device, and stays in the ADR.

One prepared answer, because it is the obvious challenge to the decision. _"If the server computes freshness and the socket dies, the console stops degrading — isn't that the exact failure you claim to prevent?"_ No, and the alternative is worse. A client-side timer degrades every robot to UNREACHABLE when the console's own connection drops, which reports a fleet-wide machine failure that did not happen. Server-side derivation plus per-robot label suppression keeps the two failures distinct: three rows moving means three robots went silent; the banner means the console cannot see anything. An operator dispatches a technician on the first and calls IT on the second. The console's job is to make them tell those apart, and collapsing them into one client timer is the honest-looking answer that destroys the distinction.

The decision was re-opened and re-confirmed on 19 August 2026; the audit backlog had recommended the client-side position, and the reasoning for overruling it is in the ADR's Observed consequences rather than improvised.

## ADR 4 — Feature-sliced structure with an enforced dependency rule

This is the direct answer to the second framing question from the call: how a codebase stays "not slop" once an agent writes most of it. The structure is deliberately oversized relative to the current problem, which the call said is welcome when justified against scale.

The front end is the graded deliverable; the simulator and server exist to feed it.

Schedule: roughly thirty minutes was allotted to wiring the boundary rule and it consumed closer to ninety, the first real overrun against the day-one hour-three trigger in the project plan. `dependency-cruiser` was held as the fallback if `eslint-plugin-boundaries` resisted configuration for more than twenty minutes; that trigger was passed and the fallback was not taken, because the debugging was version-syntax churn rather than a dead end.

## ADR 5 — Material UI with a token layer

Tailwind was named on the call as an argument that would be rejected, so it is not a live option regardless of technical merit. The ADR states the engineering reason — it is a second styling system — and this is where the external reason lives.

MUI's CSS theme variables API is named in Position 3 as the more scalable answer for a codebase actually at four thousand files. That naming is a commitment: the follow-up call answer about theming at scale should reference ADR 5 rather than be improvised.

## ADR 6 — Bounded in-memory history

Choosing not to add a database is itself the point worth making. It is easy to add infrastructure to look thorough, and the ADR names the condition under which persistence becomes necessary instead.

The multi-instance and `node:cluster` shared-state constraint is out of scope for the build but should be sayable precisely in the follow-up call.
