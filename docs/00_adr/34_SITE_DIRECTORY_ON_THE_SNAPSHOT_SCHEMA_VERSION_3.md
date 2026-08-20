# ADR 34 — Site Directory on the Fleet Snapshot, Schema Version 3

**Decision:** The fleet manifest and the `GET /api/fleet` snapshot carry a required `sites` directory of strict `{ siteId, label }` entries with unique ids and validated robot references; the schema version advances from "2" to "3" with no compatibility fallback, and telemetry envelopes keep carrying bare `siteId` values.
**Status:** Decided · 2026-08-20 · Implemented
**Group:** Contracts / wire format (what the console may know about a site, and which response is allowed to say it).

## Issue

Every telemetry envelope and manifest entry names a `siteId`, and nothing anywhere named a site. The console shipped a fixture table of four sites (`zone-a` … `dock-a3`) that no real deployment ever produced, so the fleet page's site filter offered names for sites that do not exist while rendering the real fleet's `SITE-NORTH` through a raw-identifier fallback. `packages/FIXME.md` **F16** recorded the gap: a display name had no source.

Two sub-questions had to be settled together: where labels live (configuration, snapshot, envelope, or a new endpoint), and whether the wire change is versioned or slipped in as an optional field.

## Assumptions

- Site labels change at deployment cadence, not telemetry cadence. A label is configuration, like the roster itself.
- The set of sites is small (single digits) and enumerable, unlike the open vendor set.
- No deployed consumer exists outside this repository, so a hard version cut costs nothing today and buys a single unambiguous wire format.

## Constraints

- Principle 1: one authoritative source for a label; a fixture table in the console and a directory on the wire cannot coexist.
- ADR 1 rejects present-but-meaningless fields; a label restated on every envelope is the same fact at telemetry rate.
- ADR 14: the manifest's spelling is canonical and the simulator must keep reproducing the committed file byte for byte.
- `packages/contracts/AGENTS.md`: schema versions evolve deliberately; an unsupported version is rejected, never reinterpreted.

## Decision

The manifest widens to `{ sites, robots }`: a non-empty `sites` array of strict `{ siteId, label }` entries, unique by id, with every robot's `siteId` required to reference a defined site. The committed configuration seeds North site, South site, and East site; the simulator emits the same directory from `SITE_DIRECTORY` so parity holds byte for byte.

The snapshot schema gains a required `sites` field carrying the directory through `GET /api/fleet` — and only there. Telemetry envelopes, deltas, and the diagnostic endpoint keep carrying authoritative `siteId` values without labels. Referential integrity is enforced in `fleetSnapshotSchema` itself: duplicate site ids and robot references to undefined sites are contract failures, not consumer fallbacks.

`SCHEMA_VERSION` advances to "3" with no fallback: producers, consumers, fixtures, schemas, and documentation moved together in one change, and a version-2 payload is rejected.

## Positions

1. **Label on every envelope.** Rejected: the same fact restated at telemetry rate, and the first place two labels for one site could disagree (ADR 1, Principle 1).
2. **A separate `GET /api/sites` endpoint.** Rejected: a second request the console must sequence against the snapshot, for a directory that is a property of the same fleet the snapshot already describes. The joining picture should be one response (ADR 2).
3. **Console-side configuration of labels.** Rejected: the console would need per-deployment configuration naming the server's sites, which is the drift F16 documented, formalized.
4. **Directory on the snapshot, optional field, version stays "2".** Rejected: an optional directory forces every consumer to keep the raw-id fallback forever, which is the invented-label rendering this decision exists to remove.
5. **Directory on the snapshot, required, version "3".** Chosen.

## Argument

The snapshot is where a joining console learns everything else about the fleet; the site directory is more of the same initial picture, not a new kind of data. Making it required rather than optional is what lets the console delete its fixture table and its permanent fallback: a decoded snapshot provably names every site its robots reference, so an unlabeled site cannot occur downstream of the boundary — the property is enforced once, in `fleetSnapshotSchema`, rather than defensively in every consumer.

The version bump is honest labeling. A version-2 consumer reading a version-3 body would silently ignore `sites` only if the schema were loosened to permit unknown fields, which contradicts the strict-object rule that catches contract drift. With no deployed third-party consumers, the coordinated cut is strictly cheaper than a compatibility window nobody needs.

## Implications

- **The console's `SITES` fixture and closed `Vendor` union die together.** Site options and labels derive from the snapshot directory; vendor options derive from observed robots. The raw site id remains only as a transient fallback before the first snapshot lands.
- **The manifest is now the single origin of labels.** A label change is a configuration change and a server restart, not a code change.
- **`fleetManifestSchema` and `fleetSnapshotSchema` enforce the same referential rules at two boundaries.** Startup catches a bad manifest; the schema catches a bad response. Both are registered under `mechanicalRules`.
- **The simulator's `SITE_DIRECTORY` mirrors a schema it cannot import**, exactly as `FleetManifestEntry` does (ADR 14); `manifestParity.test.ts` keeps the mirror honest, now including the directory.
- **Every producer of a snapshot fixture must define sites** covering the robots it names, or the fixture fails to decode — which is the point.
- **A version-2 payload anywhere in the system is now a loud failure**, including old recorded fixtures; `pnpm record:fixtures` re-records at "3".

## Open questions

- **Should the directory carry more than a label (timezone, map frame, address)?**
  _Current lean:_ No. Add fields when a surface needs them; the strict object makes the addition deliberate.
  _Resolves on:_ the first console surface that needs a second site attribute.

## Observed consequences

- **20 August 2026 — the parity chain absorbed the change with no new mechanism.** The committed manifest, the simulator's printed document, and the server's schema moved in one change and the existing byte-for-byte test held; the directory rides the same join the roster does.

## Related

- **ADR 1** (adapter boundary) — why a label never rides an envelope.
- **ADR 2** (transport) — why the joining picture is one HTTP response.
- **ADR 14** (roster parity) — the manifest ownership and parity mechanism this widens; amended by this decision.
- **ADR 25** (contracts owns every decoded response) — the snapshot response consequence: the console decodes the directory with the same one authority; amended by this decision.
- **Principle 1** (one authoritative implementation) — the core argument against every rejected position.
- **Artifact `packages/contracts/src/envelope/envelopeSchema.ts`** — `fleetSiteSchema`, the required `sites` field, and the referential refinement.
- **Artifact `packages/server/src/config/fleetManifest.ts`** — the widened startup validation.
- **Artifact `packages/simulator/src/fleet/createFleet.ts`** — `SITE_DIRECTORY`, the emitting mirror.
- **Artifact `config/fleet-manifest.json`** — the shipped directory and roster.

## Notes

- 20 August 2026: recorded as **D25** during the web alignment plan (`docs/05_plans/WEB.md`, since archived as `docs/04_archive/WEB_ALIGNMENT_PLAN.md`), which required the console to stop inventing site labels.
