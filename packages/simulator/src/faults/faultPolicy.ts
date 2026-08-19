/**
 * Targeted fault injection.
 *
 * A fault is simulator control state, never a value inside a telemetry payload.
 * `--drop` is modelled as absence: the selected robots produce no reading and
 * send no request, which is the only honest way to simulate a robot that has
 * gone quiet. Emitting a "disconnected" or "stale" vendor value instead would
 * hand the server a fact it is supposed to derive, and ADR 3 puts that
 * derivation in the server's sweep over `receivedAt` (AGENTS.md § Fault injection).
 */

/** Raised when a fault targets a robot that does not exist in the built fleet. */
export class UnknownRobotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownRobotError";
  }
}

/** Which robots are silenced for this run. */
export interface FaultPolicy {
  /** True when the named robot must produce nothing at all. */
  isDropped(robotId: string): boolean;
  /** The silenced identifiers, sorted, for startup logging and metrics. */
  readonly droppedRobotIds: readonly string[];
}

/**
 * Builds the fault policy, rejecting identifiers absent from the fleet.
 *
 * An unknown identifier is a startup failure rather than a silent no-op: a
 * mistyped `--drop R-2O4` that quietly dropped nothing would present as "the
 * freshness demo does not work" long after the typo scrolled off screen
 * (AGENTS.md § CLI and configuration).
 */
export function createFaultPolicy(
  droppedRobotIds: readonly string[],
  knownRobotIds: readonly string[],
): FaultPolicy {
  const known = new Set(knownRobotIds);
  const unknown = droppedRobotIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new UnknownRobotError(
      `--drop names ${String(unknown.length)} robot(s) not in this fleet: ${unknown.join(", ")}. ` +
        `Fleet ids run from ${knownRobotIds[0] ?? "(empty)"} to ${knownRobotIds.at(-1) ?? "(empty)"}.`,
    );
  }

  const dropped = new Set(droppedRobotIds);
  return {
    isDropped(robotId: string): boolean {
      return dropped.has(robotId);
    },
    droppedRobotIds: [...dropped].sort(),
  };
}

/** A policy that silences nothing; the normal-mode default. */
export const NO_FAULTS: FaultPolicy = {
  isDropped(): boolean {
    return false;
  },
  droppedRobotIds: [],
};
