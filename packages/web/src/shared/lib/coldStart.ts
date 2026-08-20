import { isDeltaCoveredBySnapshot } from "@fleet/contracts";
import type { FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

/**
 * The cold-start ordering: open the socket, buffer, then fetch, then reconcile.
 *
 * ADR 2 gives a joining console its initial picture over HTTP rather than as the socket's
 * first frame, so the socket carries one message shape for its whole lifetime. That choice
 * is only safe because of the flush sequence: whatever the server flushes between the
 * socket opening and the snapshot being captured has to be recovered from the buffer, and
 * whatever the snapshot already reflects has to be discarded (ADR 18).
 *
 * **Fetching before opening is the failure this module exists to prevent**, and it is worth
 * a module rather than a comment because the symptom is invisible: every delta emitted in
 * the gap is lost, and the console shows a row that quietly stops updating instead of an
 * error. Nothing else in the system catches that (server TODO **H3b**).
 *
 * The reconciliation rule itself is `isDeltaCoveredBySnapshot` from `@fleet/contracts`, not
 * a comparison written again here: both sides of the wire must agree on it, and a rule
 * implemented once cannot be implemented differently twice (Principle 1).
 */

/** What a joining console should apply, in order, once its snapshot arrives. */
export interface ColdStartResult {
  readonly snapshot: FleetSnapshot;
  /** Buffered frames the snapshot does not already cover, oldest first. */
  readonly replay: readonly TelemetryBatch[];
  /** Frames discarded as redundant; reported so a client can log rather than infer. */
  readonly discarded: number;
}

/** Buffers frames until the snapshot lands, then hands back what still has to be applied. */
export interface ColdStart {
  /**
   * Records one frame.
   *
   * Returns `"buffered"` while the snapshot is outstanding and `"live"` once it has
   * landed, so the caller applies the frame directly rather than growing a second buffer
   * that nothing drains.
   */
  receive(batch: TelemetryBatch): "buffered" | "live";
  /** Settles the buffer against the snapshot. Calling it twice is a programming error. */
  settle(snapshot: FleetSnapshot): ColdStartResult;
  /** Whether the snapshot has landed. */
  readonly isSettled: boolean;
}

/** Creates a cold start that has not yet received its snapshot. */
export function createColdStart(): ColdStart {
  const buffered: TelemetryBatch[] = [];
  let settled = false;

  return {
    get isSettled(): boolean {
      return settled;
    },

    receive(batch): "buffered" | "live" {
      if (settled) return "live";
      buffered.push(batch);
      return "buffered";
    },

    settle(snapshot): ColdStartResult {
      if (settled) {
        // A second settle would silently replay frames the caller has already applied.
        // Throwing here is a bug report; returning an empty result would hide it.
        throw new Error("Cold start already settled; a console fetches one snapshot.");
      }
      settled = true;

      const replay = buffered.filter(
        (batch) => !isDeltaCoveredBySnapshot(snapshot.flushSequence, batch.flushSequence),
      );
      const discarded = buffered.length - replay.length;
      buffered.length = 0;
      return { snapshot, replay, discarded };
    },
  };
}
