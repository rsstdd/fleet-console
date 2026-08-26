import {
  type CanonicalEnvelope,
  type FreshnessState,
  type RegisteredRobotState,
  SCHEMA_VERSION,
  type SequenceHealth,
  withFreshness,
} from "@fleet/contracts";

export interface ManifestRobot {
  readonly robotId: string;
  readonly siteId: string;
  readonly vendorId: string;
  readonly model: string;
}

export type UnobservedRobotState = RegisteredRobotState & Pick<ManifestRobot, "model">;
export type CurrentRobotState = UnobservedRobotState | CanonicalEnvelope;

export type UpsertResult =
  | { readonly kind: "accepted"; readonly state: CanonicalEnvelope }
  | { readonly kind: "duplicate" }
  | {
      readonly kind: "out-of-order";
      readonly acceptedSequence: number;
      readonly receivedSequence: number;
    };

interface RobotSlot {
  state: CurrentRobotState;
  rawPayload: Readonly<Record<string, unknown>> | null;
  sequence: number | null;
  sequenceHealth: SequenceHealth | null;
}

export function isObserved(state: CurrentRobotState): state is CanonicalEnvelope {
  return "receivedAt" in state;
}

/** Registered but unobserved robots remain present with unknown freshness. */
export class CurrentStateStore {
  readonly #robots = new Map<string, RobotSlot>();

  constructor(manifest: readonly ManifestRobot[]) {
    for (const robot of manifest) {
      if (this.#robots.has(robot.robotId)) {
        throw new Error(`Duplicate robot id in manifest: ${robot.robotId}`);
      }
      this.#robots.set(robot.robotId, {
        state: { ...robot, schemaVersion: SCHEMA_VERSION, freshness: "unknown" },
        rawPayload: null,
        sequence: null,
        sequenceHealth: null,
      });
    }
  }

  get(robotId: string): CurrentRobotState | undefined {
    return this.#robots.get(robotId)?.state;
  }

  list(): CurrentRobotState[] {
    return [...this.#robots.values()].map((slot) => slot.state);
  }

  observed(): CanonicalEnvelope[] {
    return this.list().filter(isObserved);
  }

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
      if (sequence === slot.sequence) {
        slot.sequenceHealth = countDuplicate(slot.sequenceHealth);
        return { kind: "duplicate" };
      }
      return {
        kind: "out-of-order",
        acceptedSequence: slot.sequence,
        receivedSequence: sequence,
      };
    }

    slot.sequenceHealth = advanceSequenceHealth(slot.sequenceHealth, slot.sequence, sequence);
    slot.state = envelope;
    slot.rawPayload = rawPayload === null ? null : structuredClone(rawPayload);
    slot.sequence = sequence;
    return { kind: "accepted", state: envelope };
  }

  setFreshness(robotId: string, freshness: FreshnessState): CanonicalEnvelope | null {
    const slot = this.#robots.get(robotId);
    if (slot === undefined || !isObserved(slot.state)) {
      return null;
    }
    const next = withFreshness(slot.state, freshness);
    if (next === slot.state) {
      return null;
    }
    slot.state = next;
    return next;
  }

  sequenceHealth(robotId: string): SequenceHealth | null {
    return this.#robots.get(robotId)?.sequenceHealth ?? null;
  }

  rawPayload(robotId: string): Readonly<Record<string, unknown>> | null {
    const raw = this.#robots.get(robotId)?.rawPayload;
    return raw === undefined || raw === null ? null : structuredClone(raw);
  }

  sequenceByVendor(): Record<string, SequenceHealth> {
    const rollup: Record<string, SequenceHealth> = {};
    for (const slot of this.#robots.values()) {
      if (!isObserved(slot.state) || slot.sequenceHealth === null) {
        continue;
      }
      rollup[slot.state.vendorId] = mergeSequenceHealth(
        rollup[slot.state.vendorId],
        slot.sequenceHealth,
      );
    }
    return rollup;
  }
}

function countDuplicate(current: SequenceHealth | null): SequenceHealth {
  return current !== null && current.evaluated
    ? { ...current, duplicates: current.duplicates + 1 }
    : { evaluated: true, gaps: 0, duplicates: 1 };
}

function advanceSequenceHealth(
  current: SequenceHealth | null,
  previous: number | null,
  next: number | null,
): SequenceHealth {
  if (next === null) {
    return { evaluated: false };
  }
  if (current === null || !current.evaluated) {
    return { evaluated: true, gaps: 0, duplicates: 0 };
  }
  const missing = previous === null ? 0 : Math.max(next - previous - 1, 0);
  return { ...current, gaps: current.gaps + missing };
}

function mergeSequenceHealth(
  rollup: SequenceHealth | undefined,
  robot: SequenceHealth,
): SequenceHealth {
  if (rollup === undefined) {
    return robot;
  }
  if (!rollup.evaluated || !robot.evaluated) {
    return { evaluated: false };
  }
  return {
    evaluated: true,
    gaps: rollup.gaps + robot.gaps,
    duplicates: rollup.duplicates + robot.duplicates,
  };
}
