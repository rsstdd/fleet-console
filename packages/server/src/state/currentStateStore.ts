import {
  type CanonicalEnvelope,
  type FreshnessState,
  SCHEMA_VERSION,
  type RegisteredRobotState,
  type SequenceHealth,
  withFreshness,
} from "@fleet/contracts";

import { RingBuffer } from "./ringBuffer.ts";

/** Retained observations per robot: one minute at the nominal 1 Hz reporting rate. */
export const HISTORY_CAPACITY = 60;

/** One validated fleet-manifest entry used to seed server state. */
export interface ManifestRobot {
  readonly robotId: string;
  readonly siteId: string;
  readonly vendorId: string;
  readonly model: string;
}

/** A registered robot before its first telemetry observation. */
export type UnobservedRobotState = RegisteredRobotState & Pick<ManifestRobot, "model">;

/** Current server state for either a never-observed or observed robot. */
export type CurrentRobotState = UnobservedRobotState | CanonicalEnvelope;

/** Outcome of an idempotent telemetry upsert. */
export type UpsertResult =
  | { readonly kind: "accepted"; readonly state: CanonicalEnvelope }
  | { readonly kind: "duplicate" | "out-of-order"; readonly state: CurrentRobotState };

interface RobotSlot {
  state: CurrentRobotState;
  rawPayload: Readonly<Record<string, unknown>> | null;
  sequence: number | null;
  /**
   * This robot's continuity, or null before it has been heard from at all.
   *
   * Null rather than `{ evaluated: false }`: that value states "this dialect carries no
   * counter", which is a claim about vendor B and not about a robot that simply has not
   * reported yet. Only an observed robot has a diagnostic envelope, so the null is never
   * serialized.
   *
   * Continuity is tracked **here** because this is where the previous accepted sequence
   * lives. Computing it anywhere else means a second copy of that number, and two copies
   * of one fact is the drift Principle 1 forbids (**D6a**).
   */
  sequenceHealth: SequenceHealth | null;
  readonly history: RingBuffer<CanonicalEnvelope>;
}

function isObserved(state: CurrentRobotState): state is CanonicalEnvelope {
  return "receivedAt" in state;
}

/**
 * Copies a raw payload across the store's boundary, in either direction.
 *
 * A deep copy, not the `{ ...rawPayload }` spread this used to do (ADR 26). The spread
 * copies the top level only, so a caller holding a nested object — the same object the
 * adapter just read — could mutate retained evidence after the fact. Evidence a technician
 * is asked to trust must not be reachable from anywhere else, and "the caller happens not
 * to keep a reference today" is a property of code that changes.
 *
 * Applied on the way **out** as well as in. Retaining a private copy and then handing the
 * same object to a response handler leaves the store's evidence editable by whoever reads
 * it, which is the same defect facing the other way — and it was caught by a test written
 * for the inbound direction only. Both copies are bounded by `MAX_INGEST_BYTES`; the
 * outbound one happens on a technician-only endpoint, not in the ingest path.
 *
 * `structuredClone` is safe here by precondition: this value came from `JSON.parse` of a
 * request body, so it holds no functions, symbols or cycles for the clone to reject. If a
 * caller ever supplies a payload from another source, that precondition is what breaks.
 *
 * Bounded by the ingest cap rather than unbounded: `MAX_INGEST_BYTES` in
 * `../ingest/requestSizeLimit.ts` is what makes the clone cost per accepted upsert
 * calculable, and what makes 500 robots x 64 KiB the retained-memory ceiling.
 */
function copyPayload(
  rawPayload: Readonly<Record<string, unknown>> | null,
): Readonly<Record<string, unknown>> | null {
  return rawPayload === null ? null : structuredClone(rawPayload);
}

/** Manifest-seeded in-memory current state with separate bounded history and diagnostics. */
export class CurrentStateStore {
  readonly #robots = new Map<string, RobotSlot>();

  /** Creates UNKNOWN entries for every manifest robot. */
  constructor(manifest: readonly ManifestRobot[], historyCapacity = HISTORY_CAPACITY) {
    for (const robot of manifest) {
      if (this.#robots.has(robot.robotId)) {
        throw new Error(`Duplicate robot id in manifest: ${robot.robotId}`);
      }
      this.#robots.set(robot.robotId, {
        state: { ...robot, schemaVersion: SCHEMA_VERSION, freshness: "unknown" },
        rawPayload: null,
        sequence: null,
        sequenceHealth: null,
        history: new RingBuffer(historyCapacity),
      });
    }
  }

  /** Returns one current state, or undefined for an unregistered identifier. */
  get(robotId: string): CurrentRobotState | undefined {
    return this.#robots.get(robotId)?.state;
  }

  /** Returns every registered robot in manifest order without diagnostic raw payloads. */
  list(): CurrentRobotState[] {
    return [...this.#robots.values()].map((slot) => slot.state);
  }

  /** Returns observed canonical states only, for sweep and delta processing. */
  observed(): CanonicalEnvelope[] {
    return this.list().filter(isObserved);
  }

  /**
   * Applies newer telemetry and rejects duplicate or regressive reliable sequences.
   *
   * Coupling: `sequence` is `capabilities.sequence?.value ?? null` from the envelope
   * `@fleet/adapters` returned — vendors A and C declare that capability and vendor B
   * does not. `null` therefore means "this dialect has no counter", not "no reading
   * yet", and it disables the ordering check rather than defaulting it: a vendor whose
   * only ordering evidence is a timestamp cannot separate a duplicate delivery from two
   * events in the same millisecond, so a synthesized counter would let this method drop
   * a real reading. The same absence is what makes a robot's `sequenceHealth`
   * `{ evaluated: false }` on the diagnostic envelope (ADR 25).
   */
  upsert(
    envelope: CanonicalEnvelope,
    rawPayload: Readonly<Record<string, unknown>> | null,
    sequence: number | null,
  ): UpsertResult {
    const slot = this.#robots.get(envelope.robotId);
    if (slot === undefined) {
      throw new Error(`Telemetry received for unregistered robot: ${envelope.robotId}`);
    }
    if (slot.state.vendorId !== envelope.vendorId || slot.state.siteId !== envelope.siteId) {
      throw new Error(`Telemetry identity does not match manifest for robot: ${envelope.robotId}`);
    }
    if (sequence !== null && slot.sequence !== null && sequence <= slot.sequence) {
      const duplicate = sequence === slot.sequence;
      if (duplicate) {
        slot.sequenceHealth = countDuplicate(slot.sequenceHealth);
      }
      // A regressive arrival is counted as neither a gap nor a duplicate, because
      // `SequenceHealth` has no term for it (**D6a**). Stored state is still protected —
      // this returns without writing — so what is missing is the reporting, not the guard.
      return { kind: duplicate ? "duplicate" : "out-of-order", state: slot.state };
    }

    slot.sequenceHealth = advanceSequenceHealth(slot.sequenceHealth, slot.sequence, sequence);

    slot.state = envelope;
    slot.rawPayload = copyPayload(rawPayload);
    slot.sequence = sequence;
    slot.history.push(envelope);
    return { kind: "accepted", state: envelope };
  }

  /** Changes only derived freshness and returns the changed envelope, if any. */
  setFreshness(robotId: string, freshness: FreshnessState): CanonicalEnvelope | null {
    const slot = this.#robots.get(robotId);
    if (slot === undefined || !isObserved(slot.state)) return null;
    const next = withFreshness(slot.state, freshness);
    if (next === slot.state) return null;
    slot.state = next;
    return next;
  }

  /** Returns this robot's sequence continuity, or null before it has ever reported. */
  sequenceHealth(robotId: string): SequenceHealth | null {
    return this.#robots.get(robotId)?.sequenceHealth ?? null;
  }

  /**
   * Folds every robot's continuity into one entry per adapter.
   *
   * Derived from the per-robot values rather than accumulated alongside them (**D6a**).
   * A second accumulator would be a second authority that can disagree with the first
   * while both look plausible, and the fold is over the fleet — five hundred entries on a
   * request to a health endpoint nothing calls in a loop.
   *
   * The two scopes answer different questions and are not substitutes: this one says
   * whether a *dialect* is ordered at all, and the per-robot value says whether *this
   * robot* missed readings (ADR 25). An adapter is `{ evaluated: false }` if any of its
   * robots is, because one unordered robot means the dialect's ordering cannot be relied
   * on for the rollup's question.
   */
  sequenceByAdapter(): Record<string, SequenceHealth> {
    const rollup: Record<string, SequenceHealth> = {};
    for (const slot of this.#robots.values()) {
      if (!isObserved(slot.state) || slot.sequenceHealth === null) continue;
      rollup[slot.state.adapterId] = mergeSequenceHealth(
        rollup[slot.state.adapterId],
        slot.sequenceHealth,
      );
    }
    return rollup;
  }

  /** Returns bounded canonical history, oldest first, with no raw payloads. */
  history(robotId: string): CanonicalEnvelope[] {
    return this.#robots.get(robotId)?.history.toArray() ?? [];
  }

  /** Returns observed state plus its separately retained raw diagnostic payload. */
  diagnostic(
    robotId: string,
  ):
    (CanonicalEnvelope & { readonly rawPayload: Readonly<Record<string, unknown>> | null }) | null {
    const slot = this.#robots.get(robotId);
    if (slot === undefined || !isObserved(slot.state)) return null;
    return { ...slot.state, rawPayload: copyPayload(slot.rawPayload) };
  }
}

/**
 * Records one repeat of a sequence number already seen.
 *
 * Reachable only after a reading with a counter was accepted, so `current` is evaluated in
 * practice; the other branch starts the count rather than discarding the observation,
 * because losing a duplicate is the failure this whole field exists to prevent.
 */
function countDuplicate(current: SequenceHealth | null): SequenceHealth {
  return current !== null && current.evaluated
    ? { ...current, duplicates: current.duplicates + 1 }
    : { evaluated: true, gaps: 0, duplicates: 1 };
}

/**
 * Folds one accepted reading into a robot's continuity.
 *
 * `gaps` counts **readings missing**, not gap events, because that is what the contract's
 * own field comment says and it is the number an operator can act on: one jump of five is
 * five lost readings, and reporting it as `1` understates the loss by the amount that
 * matters.
 */
function advanceSequenceHealth(
  current: SequenceHealth | null,
  previous: number | null,
  next: number | null,
): SequenceHealth {
  // No counter in this dialect, so there is nothing to evaluate and never will be.
  // Vendor B is this case, and "0 gaps" for it is a false statement (ADR 1, **D6**).
  if (next === null) return { evaluated: false };
  if (current === null || !current.evaluated) return { evaluated: true, gaps: 0, duplicates: 0 };
  const missing = previous === null ? 0 : Math.max(next - previous - 1, 0);
  return { ...current, gaps: current.gaps + missing };
}

/** Combines two robots' continuity into an adapter-scoped answer. */
function mergeSequenceHealth(
  rollup: SequenceHealth | undefined,
  robot: SequenceHealth,
): SequenceHealth {
  if (rollup === undefined) return robot;
  if (!rollup.evaluated || !robot.evaluated) return { evaluated: false };
  return {
    evaluated: true,
    gaps: rollup.gaps + robot.gaps,
    duplicates: rollup.duplicates + robot.duplicates,
  };
}
