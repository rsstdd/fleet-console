import type { ContractIssue, FleetSite, FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

import { toRegisteredRobot, toRobot } from "@/utils/fromEnvelope";
import type { Robot } from "@/types/robot";

/**
 * The console's fleet state: the resource-state union the fleet page renders,
 * over robots keyed by id, replaced whole, notified on a frame.
 *
 * **A state machine driven by explicit transitions, not a bag of flags.** The
 * app transport reports what happened — an attempt started, a snapshot landed,
 * an attempt failed recoverably, the contract failed terminally, a frame
 * arrived — and this store owns what that means for the fleet surface
 * (Principle 5, Principle 11). Holding the resource phase next to the rows is
 * what makes "retained rows during an error" a representable state rather than
 * a coincidence of render order.
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

/**
 * What every data-bearing resource state retains: the fleet, its site
 * directory, and the provenance the footer states (ADR 34).
 */
export interface FleetData {
  /** The current fleet, in stable id order. */
  readonly robots: readonly Robot[];
  /** The snapshot's site directory, the only source of site labels (ADR 34). */
  readonly sites: readonly FleetSite[];
  /** When the server captured the snapshot these rows started from, epoch ms. */
  readonly capturedAt: number;
  /** The latest applied stream frame's `sentAt`, or null before any frame. */
  readonly latestFrameAt: number | null;
}

/**
 * Why the last join attempt failed without ending the session. Safe detail
 * only: a cause name, never a payload (ADR 20).
 */
export interface FleetRecoverableFailure {
  /** The transport's stated cause, e.g. `handshake-exhausted` (ADR 31). */
  readonly cause: string;
}

/**
 * Every user-visible state of the fleet resource (Principle 5).
 *
 * Data-bearing states retain rows, sites, and provenance so an outage shows
 * last-known truth under an honest banner instead of blanking (Principle 4).
 * Only the recoverable state exposes `retry`: offering one against a contract
 * failure would promise that retrying can change the bytes, and it cannot.
 */
export type FleetResourceState =
  /** Nothing has arrived and an attempt is in flight or pending. */
  | { readonly kind: "loading" }
  /** A snapshot is live and deltas are applying. */
  | { readonly kind: "ready"; readonly data: FleetData }
  /** A new join is running while last-known rows stay on screen. */
  | { readonly kind: "refreshing"; readonly data: FleetData }
  /** The transport stopped retrying for a cause a retry can change (ADR 31). */
  | {
      readonly kind: "recoverable-error";
      /** Retained last-known rows, or null when the first load itself failed. */
      readonly data: FleetData | null;
      readonly failure: FleetRecoverableFailure;
      readonly retry: () => void;
    }
  /** The server sent bytes this console cannot read; retrying returns the same bytes. */
  | {
      readonly kind: "terminal-error";
      /** Retained last-known rows, or null when the first load itself failed. */
      readonly data: FleetData | null;
      /** The decoder's own issues: paths and codes, never a rejected value (ADR 20). */
      readonly issues: readonly ContractIssue[];
    };

/**
 * Fleet state a component subscribes to, plus the transitions the app
 * transport drives.
 *
 * Declared as function-valued properties rather than methods, because
 * `useSyncExternalStore` takes `subscribe` and `getState` **detached**. A method would be
 * a receiver-bound signature that breaks the moment it is passed rather than called, which
 * is exactly what `@typescript-eslint/unbound-method` refuses — and it is right to. These
 * are closures over the store's state and read no `this`, and the property form says so.
 */
export interface FleetStore {
  /** A join attempt started: loading when nothing is held, refreshing over retained rows. */
  readonly snapshotStart: () => void;
  /** Seeds from a decoded snapshot, replacing everything the store held. */
  readonly applySnapshot: (snapshot: FleetSnapshot) => void;
  /** Applies one decoded frame, replacing each robot it names. */
  readonly applyBatch: (batch: TelemetryBatch) => void;
  /** The transport gave up for a retryable cause; rows are retained (ADR 31). */
  readonly recoverableFailure: (failure: FleetRecoverableFailure, retry: () => void) => void;
  /** The server's bytes failed the contract; terminal by decision (ADR 20). */
  readonly terminalFailure: (issues: readonly ContractIssue[]) => void;
  /**
   * The current resource state.
   *
   * A cached object, returned by reference until something changes, because
   * `useSyncExternalStore` compares snapshots by identity and a fresh object every call is
   * an infinite render loop rather than a performance note.
   */
  readonly getState: () => FleetResourceState;
  /** Returns one robot, or undefined when the fleet has never carried that id. */
  readonly getRobot: (robotId: string) => Robot | undefined;
  readonly subscribe: (listener: () => void) => () => void;
}

/** The internal phase, from which the published state is built. */
type Phase =
  | { readonly kind: "loading" }
  | { readonly kind: "ready" }
  | { readonly kind: "refreshing" }
  | {
      readonly kind: "recoverable-error";
      readonly failure: FleetRecoverableFailure;
      readonly retry: () => void;
    }
  | { readonly kind: "terminal-error"; readonly issues: readonly ContractIssue[] };

/** Creates an empty store; nothing is known until a snapshot is applied. */
export function createFleetStore(schedule: NotifyScheduler = queueMicrotask): FleetStore {
  const robots = new Map<string, Robot>();
  const listeners = new Set<() => void>();
  let phase: Phase = { kind: "loading" };
  /** Null until the first snapshot settles; retained through later failures. */
  let held: {
    sites: readonly FleetSite[];
    capturedAt: number;
    latestFrameAt: number | null;
  } | null = null;
  let cachedRobots: readonly Robot[] | null = null;
  let cachedState: FleetResourceState | null = null;
  let scheduled = false;

  function scheduleStoreChangeNotification(): void {
    cachedRobots = null;
    cachedState = null;
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      for (const listener of listeners) listener();
    });
  }

  function getCurrentData(): FleetData | null {
    if (held === null) return null;
    cachedRobots ??= [...robots.values()];
    return {
      robots: cachedRobots,
      sites: held.sites,
      capturedAt: held.capturedAt,
      latestFrameAt: held.latestFrameAt,
    };
  }

  function buildState(): FleetResourceState {
    const data = getCurrentData();
    switch (phase.kind) {
      case "loading":
        return { kind: "loading" };
      case "ready":
      case "refreshing":
        if (data === null) return { kind: "loading" };
        return { kind: phase.kind, data };
      case "recoverable-error":
        return { kind: "recoverable-error", data, failure: phase.failure, retry: phase.retry };
      case "terminal-error":
        return { kind: "terminal-error", data, issues: phase.issues };
    }
  }

  return {
    snapshotStart: (): void => {
      // Refreshing only over settled rows: a retry after a first-load failure
      // has nothing to retain and shows loading, not a phantom refresh.
      phase = held === null ? { kind: "loading" } : { kind: "refreshing" };
      scheduleStoreChangeNotification();
    },

    applySnapshot: (snapshot): void => {
      // Replace rather than merge: the snapshot is the whole fleet, so a robot missing
      // from it has left the manifest and must not survive as a stale row.
      robots.clear();
      for (const entry of snapshot.robots) {
        const robot = "receivedAt" in entry ? toRobot(entry) : toRegisteredRobot(entry);
        robots.set(robot.id, robot);
      }
      // A fresh snapshot is a fresh provenance epoch: the latest-frame instant
      // restarts at null and the replayed frames re-establish it (ADR 31).
      held = { sites: snapshot.sites, capturedAt: snapshot.capturedAt, latestFrameAt: null };
      phase = { kind: "ready" };
      scheduleStoreChangeNotification();
    },

    applyBatch: (batch): void => {
      if (batch.robots.length === 0) return;
      for (const envelope of batch.robots) {
        robots.set(envelope.robotId, toRobot(envelope));
      }
      if (held !== null) {
        held = { ...held, latestFrameAt: batch.sentAt };
      }
      scheduleStoreChangeNotification();
    },

    recoverableFailure: (failure, retry): void => {
      phase = { kind: "recoverable-error", failure, retry };
      scheduleStoreChangeNotification();
    },

    terminalFailure: (issues): void => {
      phase = { kind: "terminal-error", issues };
      scheduleStoreChangeNotification();
    },

    getState: (): FleetResourceState => {
      cachedState ??= buildState();
      return cachedState;
    },

    getRobot: (robotId): Robot | undefined => {
      return robots.get(robotId);
    },

    subscribe: (listener): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
