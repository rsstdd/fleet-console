import type { FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

import { toRegisteredRobot, toRobot } from "./fromEnvelope";
import type { Robot } from "./model";

/**
 * The console's fleet state: robots keyed by id, replaced whole, notified on a frame.
 *
 * **Keyed replace, never merge.** ADR 18 keeps delta granularity at the robot level and
 * says why: a field-level patch would make this a merge engine and partial application a
 * possible state. Each frame carries whole envelopes, so applying one is a `set` — which
 * is also what makes a re-ordered or duplicated frame harmless rather than corrupting.
 *
 * **Notification is scheduled; application is not.** Applying on a frame would hold state
 * the console has already received, which is a second coalescing layer on top of the
 * server's (ADR 2 caps the wire at 10 Hz already) and would make the store lie about what
 * it knows. What is bounded here is how often subscribers are woken, which is a rendering
 * concern rather than a data one (fleet spec § 6, Principle 12).
 *
 * **No freshness timer, and no derivation.** `freshness` is copied from the field the
 * server's sweep set (ADR 3). A client that aged robots locally would be a second
 * authority that can disagree with the first, and the disagreement would be invisible.
 *
 * Framework-independent on purpose: `useSyncExternalStore` wants exactly this shape, and
 * a store that needed React could not be tested without rendering.
 */

/** Schedules one notification; the caller supplies the frame, so tests supply none. */
export type NotifyScheduler = (notify: () => void) => void;

/** Fleet state a component subscribes to. */
export interface FleetStore {
  /** Seeds from a decoded snapshot, replacing everything the store held. */
  applySnapshot(snapshot: FleetSnapshot): void;
  /** Applies one decoded frame, replacing each robot it names. */
  applyBatch(batch: TelemetryBatch): void;
  /**
   * The current fleet, in stable id order.
   *
   * A cached array, returned by reference until something changes, because
   * `useSyncExternalStore` compares snapshots by identity and a fresh array every call is
   * an infinite render loop rather than a performance note.
   */
  getRobots(): readonly Robot[];
  /** Returns one robot, or undefined when the fleet has never carried that id. */
  getRobot(robotId: string): Robot | undefined;
  subscribe(listener: () => void): () => void;
}

/** Creates an empty store; nothing is known until a snapshot is applied. */
export function createFleetStore(schedule: NotifyScheduler = queueMicrotask): FleetStore {
  const robots = new Map<string, Robot>();
  const listeners = new Set<() => void>();
  let cached: readonly Robot[] | null = null;
  let scheduled = false;

  function changed(): void {
    cached = null;
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      for (const listener of listeners) listener();
    });
  }

  return {
    applySnapshot(snapshot): void {
      // Replace rather than merge: the snapshot is the whole fleet, so a robot missing
      // from it has left the manifest and must not survive as a stale row.
      robots.clear();
      for (const entry of snapshot.robots) {
        const robot = "receivedAt" in entry ? toRobot(entry) : toRegisteredRobot(entry);
        robots.set(robot.id, robot);
      }
      changed();
    },

    applyBatch(batch): void {
      if (batch.robots.length === 0) return;
      for (const envelope of batch.robots) {
        robots.set(envelope.robotId, toRobot(envelope));
      }
      changed();
    },

    getRobots(): readonly Robot[] {
      cached ??= [...robots.values()];
      return cached;
    },

    getRobot(robotId): Robot | undefined {
      return robots.get(robotId);
    },

    subscribe(listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
