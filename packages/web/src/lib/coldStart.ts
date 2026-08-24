import { reconcileDeltaWithSnapshot } from "@fleet/contracts";
import type { FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

/**
 * The cold-start ordering: open the socket, buffer, then fetch, then reconcile.
 *
 * ADR 2 gives a joining console its initial picture over HTTP rather than as the socket's
 * first frame, so the socket carries one message shape for its whole lifetime. That choice
 * is only safe because of the reconciliation fields: whatever the server flushes between
 * the socket opening and the snapshot being captured has to be recovered from the buffer,
 * whatever the snapshot already reflects has to be discarded (ADR 18), and whatever came
 * from a *different server runtime* has to be refused rather than compared (ADR 31).
 *
 * **Fetching before opening is the failure this module exists to prevent**, and it is worth
 * a module rather than a comment because the symptom is invisible: every delta emitted in
 * the gap is lost, and the console shows a row that quietly stops updating instead of an
 * error. The deterministic ordering tests here and the ADR 32 restart scenario are the
 * evidence that catches it (ADR 18, ADR 31).
 *
 * The reconciliation rule itself is `reconcileDeltaWithSnapshot` from `@fleet/contracts`,
 * not a comparison written again here: both sides of the wire must agree on it, and a rule
 * implemented once cannot be implemented differently twice (Principle 1).
 *
 * Coupling: this module settles only the *buffered* frames. Frames arriving after the
 * snapshot report `"live"` and `fleetTransport` reconciles each against the settled
 * snapshot's epoch with the same contracts function — including the session check that
 * turns a mismatched live frame into the terminal integrity state (ADR 31).
 */

/** What a joining console should apply, in order, once its snapshot arrives. */
export interface ColdStartResult {
  readonly snapshot: FleetSnapshot;
  /** Buffered same-session frames the snapshot does not already cover, oldest first. */
  readonly replay: readonly TelemetryBatch[];
  /** Same-session frames discarded as redundant; reported so a client can log rather than infer. */
  readonly discarded: number;
  /**
   * Frames from a different server runtime than the snapshot (ADR 31). Never applied —
   * and any positive count means the socket disagrees with the snapshot, which the
   * transport must treat as a stream-integrity failure rather than noise.
   */
  readonly mismatched: number;
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

/**
 * Creates a cold start that has not yet received its snapshot.
 *
 * @returns A buffer in the pre-snapshot state, holding every frame `receive` is given
 *   until the one permitted `settle` reconciles them. Cheap to discard and rebuild,
 *   which is what each connection attempt does — a buffer carried across attempts would
 *   replay another socket's frames against this one's snapshot.
 */
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

      const replay: TelemetryBatch[] = [];
      let discarded = 0;
      let mismatched = 0;
      for (const batch of buffered) {
        switch (reconcileDeltaWithSnapshot(snapshot, batch)) {
          case "apply":
            replay.push(batch);
            break;
          case "covered":
            discarded += 1;
            break;
          case "session-mismatch":
            mismatched += 1;
            break;
        }
      }
      buffered.length = 0;
      return { snapshot, replay, discarded, mismatched };
    },
  };
}
