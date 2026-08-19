import { z } from "zod";

import {
  capabilitiesWireSchema,
  type CapabilityWireEntry,
  encodeCapabilities,
} from "../capabilities/capabilitySchemas.js";

import {
  batteryPercentSchema,
  connectivitySchema,
  displayNameSchema,
  epochMillisecondsSchema,
  flushSequenceSchema,
  type FreshnessState,
  freshnessStateSchema,
  healthSchema,
  identifierSchema,
  type ParseResult,
  parseWith,
  positionSchema,
  robotStatusSchema,
  schemaVersionSchema,
  sequenceHealthSchema,
  vendorIdSchema,
  versionStringSchema,
} from "../shared/primitives.js";

/**
 * The canonical envelope: one shape every vendor's telemetry is translated into,
 * and the only shape the server stores and the console consumes (ADR 1).
 *
 * Two representations exist for one contract. The wire form carries capabilities
 * as an array of entries so JSON preserves them; the runtime form carries the
 * mapped record. `canonicalEnvelopeSchema` decodes the first into the second and
 * `encodeCanonicalEnvelope` reverses it.
 *
 * Every object here is a `strictObject`. An unrecognized canonical field is
 * contract drift and must fail loudly; vendor unknown fields are a different
 * problem, counted rather than dropped by `packages/adapters` (ADR 1).
 */

/**
 * The normalized core: only meaning genuinely shared across every vendor.
 *
 * A field belongs here only if every adapter can populate it from its own
 * dialect. Anything one vendor has and another does not is a declared
 * capability instead — a core field that is simply empty for some vendors is the
 * failure mode ADR 1 and Principle 3 exist to prevent.
 */
export const canonicalCoreSchema = z.strictObject({
  /** The robot's own reported link state; not freshness and not the console's socket state. */
  connectivity: connectivitySchema,
  /** Charge percentage, or null when the vendor did not report one. */
  batteryPercent: batteryPercentSchema.nullable(),
  /** Position in a named map frame, or null when the vendor did not report one. */
  position: positionSchema.nullable(),
  status: robotStatusSchema,
  health: healthSchema,
});

/** The normalized fields every vendor's telemetry maps onto. */
export type CanonicalCore = z.infer<typeof canonicalCoreSchema>;

/**
 * Envelope fields shared by the wire and runtime forms — everything except
 * capabilities, which differ in shape between the two.
 */
/**
 * Every envelope field an adapter can legitimately produce: identity,
 * provenance, both timestamps and the normalized core — but not freshness.
 *
 * The canonical shape below is derived from this one by adding the single field
 * the server owns, rather than the two being written out side by side. That
 * derivation is the mechanism behind ADR 10: a field added here reaches both
 * shapes, and a field that reaches only one of them is a compile error in
 * `envelopeSchema.test.ts` rather than a drift nobody notices.
 */
const preFreshnessShape = {
  /** The contract version this envelope was produced against. */
  schemaVersion: schemaVersionSchema,
  robotId: identifierSchema,
  siteId: identifierSchema,
  /** Open identifier, not a closed enum: a fourth vendor is an adapter, never a contracts change. */
  vendorId: vendorIdSchema,
  /** Vendor's model designation, shown to operators. */
  model: displayNameSchema,
  adapterId: identifierSchema,
  adapterVersion: versionStringSchema,
  /**
   * The vendor-reported telemetry instant, normalized to epoch milliseconds.
   * This is what the console shows as "last seen"; the freshness sweep never
   * reads it (ADR 3).
   */
  reportedAt: epochMillisecondsSchema,
  /**
   * The server's own receipt instant. The only clock the freshness guarantee
   * can be made against, and the only field `deriveFreshness` reads (ADR 3).
   *
   * No ordering invariant ties this to `reportedAt`. Transport delay usually
   * puts it later, but a skewed vendor clock can put it earlier, and that
   * condition is what the technician clock-delta readout exists to surface —
   * rejecting it here would discard the evidence.
   */
  receivedAt: epochMillisecondsSchema,
  core: canonicalCoreSchema,
} as const;

/** The canonical field set: everything an adapter produces, plus server-owned freshness. */
const envelopeBaseShape = {
  ...preFreshnessShape,
  /**
   * Server-derived freshness, carried as a field rather than recomputed by any
   * consumer. `packages/web` displays it and holds no timer (ADR 3).
   *
   * Coupling: this is the only field `packages/adapters` may not populate. The
   * shape without it is `adapterEnvelopeSchema`, and `withFreshness` is the one
   * bridge between them (ADR 10).
   */
  freshness: freshnessStateSchema,
} as const;

/**
 * The canonical envelope as it travels on the wire and as it is decoded.
 *
 * Input: capabilities as an array of `{ name, payload }` entries.
 * Output: capabilities as the runtime mapped record.
 */
export const canonicalEnvelopeSchema = z.strictObject({
  ...envelopeBaseShape,
  capabilities: capabilitiesWireSchema,
});

/** One robot's canonical telemetry, with capabilities as the runtime record. */
export type CanonicalEnvelope = z.infer<typeof canonicalEnvelopeSchema>;

/** One robot's canonical telemetry as serialized, with capabilities as the wire array. */
export type CanonicalEnvelopeWire = Omit<CanonicalEnvelope, "capabilities"> & {
  readonly capabilities: readonly CapabilityWireEntry[];
};

/**
 * Serializes a decoded envelope back to its wire form.
 *
 * The inverse of `canonicalEnvelopeSchema`. Capabilities come back in canonical
 * name order, so two identical envelopes serialize to identical JSON and a
 * fixture diff means something changed.
 */
export function encodeCanonicalEnvelope(envelope: CanonicalEnvelope): CanonicalEnvelopeWire {
  return { ...envelope, capabilities: encodeCapabilities(envelope.capabilities) };
}

/**
 * What a vendor adapter returns: the canonical envelope minus `freshness`.
 *
 * ADR 3 gives freshness to the server's sweep alone, so an adapter has no legal
 * way to build a `CanonicalEnvelope` — it would have to invent the one value it
 * is not allowed to assert. This schema is the shape it *can* produce:
 * validated, complete in every other respect, and impossible to mistake for the
 * finished article because the missing field is missing from the type as well
 * as from the documentation (ADR 10).
 *
 * Strict, like every other shape here, which means an adapter that supplies
 * `freshness` anyway is rejected at runtime rather than silently overwritten.
 *
 * Coupling: this type does not travel on the wire. It exists between
 * `packages/adapters` and `packages/server`'s ingest handler and nowhere else;
 * `withFreshness` is the only way out of it, and the result is what gets
 * stored, fanned out and serialized.
 */
export const adapterEnvelopeSchema = z.strictObject({
  ...preFreshnessShape,
  capabilities: capabilitiesWireSchema,
});

/** One robot's canonical telemetry before the server has supplied freshness. */
export type AdapterEnvelope = z.infer<typeof adapterEnvelopeSchema>;

/**
 * Returns the envelope with a new freshness state, leaving every other field
 * untouched — and completes an adapter envelope into a canonical one.
 *
 * This is the shape of the server sweep's write: it reads `receivedAt`, calls
 * `deriveFreshness`, and applies the result. Because it replaces one field and
 * nothing else, ADR 3's invariant — a freshness-only transition cannot disturb
 * `reportedAt` or any observed value — holds by construction rather than by
 * discipline.
 *
 * It accepts an `AdapterEnvelope` for the same reason: ingest supplies the
 * field the adapter could not, through the same single constructor the sweep
 * uses. Contracts `TODO_E2E_JOIN.md` **C-2** turns on there being exactly one
 * place freshness is written, so this widens rather than adding a second one.
 *
 * Returns the original reference when a canonical envelope's state is
 * unchanged, so the fan-out coalescer can skip an unchanged robot by identity
 * (ADR 2). An adapter envelope always produces a new object, because it has no
 * previous state to be unchanged from.
 */
export function withFreshness(
  envelope: AdapterEnvelope | CanonicalEnvelope,
  freshness: FreshnessState,
): CanonicalEnvelope {
  if ("freshness" in envelope && envelope.freshness === freshness) {
    return envelope;
  }
  return { ...envelope, freshness };
}

/**
 * A robot listed in the fleet manifest that has never reported.
 *
 * Deliberately not a `CanonicalEnvelope` with nulls. A robot that has never
 * reported has no telemetry instant to null out and no core to leave empty, and
 * nullable provenance on the telemetry envelope would invite exactly the
 * "present but meaningless" fields ADR 1 rejects. Freshness is fixed at
 * `unknown`, which is the state ADR 3 created this population for.
 */
export const registeredRobotStateSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  robotId: identifierSchema,
  siteId: identifierSchema,
  /** The vendor the manifest expects, so an unexpected producer is detectable. */
  vendorId: vendorIdSchema,
  freshness: z.literal("unknown"),
});

/** A registered robot with no telemetry yet; freshness is always `unknown`. */
export type RegisteredRobotState = z.infer<typeof registeredRobotStateSchema>;

/**
 * The single-robot diagnostic contract: the canonical envelope plus the raw
 * vendor payload.
 *
 * Separate from `canonicalEnvelopeSchema` on purpose. ADR 1 keeps the raw
 * payload out of the fleet read model and the delta stream and serves it only
 * here, so the exclusion is a property of the types rather than a rule the
 * server has to remember on every response.
 *
 * `rawPayload` is required and nullable rather than optional: null states that
 * the payload was not retained, and an absent key would state nothing while
 * decoding to the same value.
 *
 * `sequenceHealth` is **this robot's** continuity, added by ADR 25. It is here rather
 * than on the health endpoint because sequence gaps are a per-robot fact: each robot has
 * its own counter, and an adapter-scope rollup cannot answer "did this robot miss
 * readings". The per-adapter rollup still exists on the health response and answers a
 * different question — whether the dialect is ordered at all. Unknown-field counts went
 * the other way, staying per-adapter, because that is the only scope the ledger has
 * (ADR 15). Separating the two by their true scope is the whole of that decision.
 *
 * Coupling: `packages/web/src/entities/robot/fromEnvelope.ts` reads this instead of
 * taking an injected `sequenceGaps`, which is what removed the console's second
 * spelling of "not evaluated".
 */
export const robotDiagnosticEnvelopeSchema = z.strictObject({
  ...envelopeBaseShape,
  capabilities: capabilitiesWireSchema,
  sequenceHealth: sequenceHealthSchema,
  rawPayload: z.record(z.string(), z.unknown()).nullable(),
});

/** A canonical envelope plus the retained raw vendor payload, served per robot. */
export type RobotDiagnosticEnvelope = z.infer<typeof robotDiagnosticEnvelopeSchema>;

/**
 * One WebSocket flush: the robots whose state changed since the last flush.
 *
 * "Delta" is at the robot level, not the field level — ADR 2 coalesces changed
 * robots and sends each one whole, which keeps the client's apply step a keyed
 * replace rather than a merge. ADR 18 keeps that granularity deliberately and
 * unmeasured: a freshness-only transition resends the whole envelope, an
 * estimated 5-10x the bytes the change requires, and accepting that stands until
 * the ADR 2 harness measures one mass-transition flush at 500 robots. A second,
 * freshness-only message shape is the next step if the number justifies it — not
 * a field-level patch, which would make the client a merge engine and partial
 * application bugs invisible.
 *
 * Coupling: `flushSequence` here and on `fleetSnapshotSchema` are the same
 * counter and must come from one source in `packages/server`. They exist to be
 * compared — see `isDeltaCoveredBySnapshot`.
 */
export const telemetryBatchSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  /**
   * The server-wide flush this batch is, so a joining client can discard what its
   * snapshot already covers (ADR 2 § Decision, ADR 18). A frame assembled from
   * several flushes carries the highest sequence it contains.
   */
  flushSequence: flushSequenceSchema,
  /** When the server flushed this batch, for measuring end-to-end delay. */
  sentAt: epochMillisecondsSchema,
  robots: z.array(canonicalEnvelopeSchema),
});

/** A coalesced WebSocket flush carrying every robot that changed. */
export type TelemetryBatch = z.infer<typeof telemetryBatchSchema>;

/**
 * One robot in a fleet snapshot: observed, or registered and never heard from.
 *
 * A union of the two shapes this package already owns rather than a third with
 * nullable telemetry. ADR 1 rejects present-but-meaningless fields, and ADR 3
 * created the never-reported population precisely so it could be UNKNOWN rather
 * than an envelope full of nulls.
 *
 * The variants are unambiguous without a discriminator key: both are strict
 * objects, so an observed envelope fails the registered schema on its extra keys
 * and a registered entry fails the envelope schema on its missing ones. A payload
 * that is somehow both is rejected by both, which is the outcome we want.
 */
export const fleetSnapshotRobotSchema = z.union([
  canonicalEnvelopeSchema,
  registeredRobotStateSchema,
]);

/** One robot as it appears in a fleet snapshot. */
export type FleetSnapshotRobot = z.infer<typeof fleetSnapshotRobotSchema>;

/**
 * The `GET /api/fleet` response: a joining console's entire initial picture.
 *
 * ADR 2 gives initial state to HTTP rather than to the socket, so the socket
 * carries exactly one message shape for its whole lifetime. That choice is only
 * safe because of `flushSequence`: the client opens the socket first and buffers
 * what arrives, then fetches this, then discards every buffered delta at or below
 * this sequence and applies the rest. Fetching before opening loses every delta
 * emitted in the gap, and the symptom is a row that silently stops updating
 * rather than an error (server TODO H3b).
 *
 * Carries the whole fleet, both populations, so a never-reported robot shows as
 * UNKNOWN rather than as absent (ADR 3).
 *
 * No raw vendor payload, by ADR 1: it is served only on the single-robot
 * diagnostic endpoint, and the type is what enforces that rather than a rule the
 * server has to remember on every response.
 */
export const fleetSnapshotSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  /**
   * The flush this snapshot was taken at. A delta at or below it is redundant.
   * Zero from a server that has never flushed, so a cold snapshot discards
   * nothing.
   */
  flushSequence: flushSequenceSchema,
  /** When the server captured this snapshot; the analogue of a batch's `sentAt`. */
  capturedAt: epochMillisecondsSchema,
  robots: z.array(fleetSnapshotRobotSchema),
});

/** A joining console's initial full picture of the fleet. */
export type FleetSnapshot = z.infer<typeof fleetSnapshotSchema>;

/**
 * Whether a buffered delta is already covered by the snapshot the client holds.
 *
 * The whole reconciliation rule, in one comparison, living here rather than in
 * `packages/web` because both sides of the wire must agree on it and a rule
 * implemented once cannot be implemented differently twice (Principle 1).
 *
 * At-or-below is redundant, because the snapshot reflects every flush up to and
 * including its own sequence. Strictly-below would re-apply the flush the
 * snapshot was taken at — harmless today, since a delta is a keyed replace of
 * state the snapshot already holds, but it stops being harmless the moment a
 * freshness-only delta shape lands and application becomes a merge (ADR 18
 * § Open questions).
 */
export function isDeltaCoveredBySnapshot(
  snapshotFlushSequence: number,
  deltaFlushSequence: number,
): boolean {
  return deltaFlushSequence <= snapshotFlushSequence;
}

/** Decodes an untrusted canonical envelope from the wire. */
export function parseCanonicalEnvelope(input: unknown): ParseResult<CanonicalEnvelope> {
  return parseWith(canonicalEnvelopeSchema, input);
}

/** Decodes an untrusted pre-freshness envelope, rejecting any attempt to assert freshness. */
export function parseAdapterEnvelope(input: unknown): ParseResult<AdapterEnvelope> {
  return parseWith(adapterEnvelopeSchema, input);
}

/** Decodes an untrusted registered-but-never-seen robot state. */
export function parseRegisteredRobotState(input: unknown): ParseResult<RegisteredRobotState> {
  return parseWith(registeredRobotStateSchema, input);
}

/** Decodes an untrusted single-robot diagnostic response, raw payload included. */
export function parseRobotDiagnosticEnvelope(input: unknown): ParseResult<RobotDiagnosticEnvelope> {
  return parseWith(robotDiagnosticEnvelopeSchema, input);
}

/** Decodes an untrusted WebSocket telemetry batch. */
export function parseTelemetryBatch(input: unknown): ParseResult<TelemetryBatch> {
  return parseWith(telemetryBatchSchema, input);
}

/** Decodes an untrusted `GET /api/fleet` response, both robot populations included. */
export function parseFleetSnapshot(input: unknown): ParseResult<FleetSnapshot> {
  return parseWith(fleetSnapshotSchema, input);
}
