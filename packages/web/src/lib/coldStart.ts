import { reconcileDeltaWithSnapshot } from "@fleet/contracts";
import type { FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

/**
 * The buffer the cold-start ordering needs: frames that arrive while the snapshot is in
 * flight are held here, then reconciled against it (ADR 18, ADR 31). `fleetTransport` owns
 * the ordering itself, and its module comment states what fetching first would cost.
 *
 * This module settles only the *buffered* frames; whatever arrives after the snapshot is
 * the caller's to reconcile against the settled epoch.
 */

/** What a joining console should apply, in order, once its snapshot arrives. */
export interface ColdStartResult {
  readonly snapshot: FleetSnapshot;
  /** Buffered same-session frames the snapshot does not already cover, oldest first. */
  readonly replay: readonly TelemetryBatch[];
  /** Same-session frames dropped as redundant; reported so a client logs rather than infers. */
  readonly discarded: number;
  /**
   * Frames from a different server runtime than the snapshot (ADR 31). Never applied —
   * and any positive count means the socket disagrees with the snapshot, which the
   * transport must treat as a stream-integrity failure rather than noise.
   */
  readonly mismatched: number;
}

/**
 * The most frames one join may buffer.
 *
 * A join buffers for as long as the snapshot takes, and `requestPolicy.timeoutMs` bounds
 * that at ten seconds against ADR 2's 10 Hz fan-out ceiling — roughly a hundred frames in
 * the worst case a deadline still permits. The limit is an order of magnitude above that,
 * so reaching it means the bound itself failed rather than that a snapshot was slow.
 */
export const COLD_START_BUFFER_LIMIT = 1_000;

/** What the buffer did with a frame offered before the snapshot landed. */
export type ColdStartReceipt = "buffered" | "overflowed";

/** Buffers frames until the snapshot lands, then hands back what still has to be applied. */
export interface ColdStart {
  receive(batch: TelemetryBatch): ColdStartReceipt;
  settle(snapshot: FleetSnapshot): ColdStartResult;
}

/**
 * @returns A buffer in the pre-snapshot state, cheap to discard and rebuild, which is what
 *   each connection attempt does — a buffer carried across attempts would replay another
 *   socket's frames against this one's snapshot.
 */
export function createColdStart(): ColdStart {
  const buffered: TelemetryBatch[] = [];
  let settled = false;

  return {
    receive(batch): ColdStartReceipt {
      if (settled) {
        // Nothing drains this buffer a second time, so a frame accepted here would be
        // lost. The caller routing live frames into it has the wrong authority.
        throw new Error("Cold start already settled; live frames are the caller's to route.");
      }

      if (buffered.length >= COLD_START_BUFFER_LIMIT) return "overflowed";

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

      const result = reconcileBuffered(snapshot, buffered);
      buffered.length = 0;

      return result;
    },
  };
}

/** Sorts every buffered frame into replay, redundant, or foreign-session (ADR 31). */
function reconcileBuffered(
  snapshot: FleetSnapshot,
  buffered: readonly TelemetryBatch[],
): ColdStartResult {
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

  return {
    snapshot,
    replay,
    discarded,
    mismatched,
  };
}
