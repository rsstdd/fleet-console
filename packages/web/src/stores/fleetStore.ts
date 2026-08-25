import type { ContractIssue, FleetSite, FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

import { toRegisteredRobot, toRobot } from "@/utils/fromEnvelope";
import type { Robot } from "@/types/robot";

/**
 * Fleet state preserves three invariants:
 *
 * - Robot updates replace whole envelopes by id; field-level merging is forbidden (ADR 18).
 * - State changes apply synchronously; only subscriber notification may be coalesced.
 * - Freshness comes exclusively from the server-provided value and is never derived locally (ADR 3).
 */

type Listener = () => void;
type Retry = () => void;

export type NotifyScheduler = (notify: Listener) => void;

export interface FleetData {
  readonly robots: readonly Robot[];
  readonly sites: readonly FleetSite[];
  readonly capturedAt: number;
  /** The applied frame's own `sentAt`, never a local clock; null before any frame. */
  readonly latestFrameAt: number | null;
}

/** Carries the transport's cause name only, never a rejected payload (ADR 20). */
export interface FleetRecoverableFailure {
  readonly cause: string;
}

/**
 * A failure retains last-known rows rather than blanking, and `data` is null only when
 * the first load itself failed (Principle 4). Only the recoverable state exposes `retry`:
 * offering one against a contract failure would promise that retrying can change the
 * bytes, and it cannot.
 */
export type FleetResourceState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: FleetData }
  | { readonly kind: "refreshing"; readonly data: FleetData }
  | {
      readonly kind: "recoverable-error";
      readonly data: FleetData | null;
      readonly failure: FleetRecoverableFailure;
      readonly retry: Retry;
    }
  | {
      readonly kind: "terminal-error";
      readonly data: FleetData | null;
      readonly issues: readonly ContractIssue[];
    };

/**
 * Declared as function-valued properties rather than methods, because
 * `useSyncExternalStore` takes `subscribe` and `getState` **detached**. A method would be
 * a receiver-bound signature that breaks the moment it is passed rather than called.
 */
export interface FleetStore {
  readonly snapshotStart: () => void;
  readonly applySnapshot: (snapshot: FleetSnapshot) => void;
  /** Ignored until a snapshot has settled; a frame has no fleet to join before then. */
  readonly applyBatch: (batch: TelemetryBatch) => void;
  readonly recoverableFailure: (failure: FleetRecoverableFailure, retry: Retry) => void;
  readonly terminalFailure: (issues: readonly ContractIssue[]) => void;
  /** Returns the same reference until something changes; `useSyncExternalStore` requires it. */
  readonly getState: () => FleetResourceState;
  readonly getRobot: (robotId: string) => Robot | undefined;
  readonly subscribe: (listener: Listener) => () => void;
}

/**
 * Pinned to one locale so two operators cannot see the fleet in different orders, and
 * numeric so `R-999` precedes `R-1000` once ids widen.
 */
const ROBOT_ID_ORDER = new Intl.Collator("en", { numeric: true });

function compareRobotIds(left: string, right: string): number {
  return ROBOT_ID_ORDER.compare(left, right);
}

interface LastKnownFleet {
  readonly sites: readonly FleetSite[];
  readonly capturedAt: number;
  readonly latestFrameAt: number | null;
}

/** The fleet rides on each state that has one; a settled state without one is unconstructable. */
type FleetStoreState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly fleet: LastKnownFleet }
  | { readonly kind: "refreshing"; readonly fleet: LastKnownFleet }
  | {
      readonly kind: "recoverable-error";
      readonly fleet: LastKnownFleet | null;
      readonly failure: FleetRecoverableFailure;
      readonly retry: Retry;
    }
  | {
      readonly kind: "terminal-error";
      readonly fleet: LastKnownFleet | null;
      readonly issues: readonly ContractIssue[];
    };

/**
 * Starts in `loading`: nothing is known until a snapshot is applied.
 *
 * @param scheduleNotification - Bounds notification only. Defaults to `queueMicrotask`,
 *   so a burst of transitions inside one task wakes subscribers once.
 */
export function createFleetStore(
  scheduleNotification: NotifyScheduler = queueMicrotask,
): FleetStore {
  const robotsById = new Map<string, Robot>();
  const listeners = new Set<Listener>();
  let state: FleetStoreState = { kind: "loading" };
  let cachedRobotList: readonly Robot[] | null = null;
  let cachedState: FleetResourceState | null = null;
  let scheduled = false;

  function notifySubscribers(): void {
    cachedRobotList = null;
    cachedState = null;

    if (scheduled) return;

    scheduled = true
    scheduleNotification(() => {
      scheduled = false;
      for (const listener of listeners) listener();
    });
  }

  function getRobotList(): readonly Robot[] {
    cachedRobotList ??= [...robotsById.values()];
    return cachedRobotList;
  }

  function buildFleetData(fleet: LastKnownFleet): FleetData {
    return {
      robots: getRobotList(),
      sites: fleet.sites,
      capturedAt: fleet.capturedAt,
      latestFrameAt: fleet.latestFrameAt,
    };
  }

  function buildResourceState(): FleetResourceState {
    switch (state.kind) {
      case "loading":
        return { kind: "loading" };
      case "ready":
        return { kind: "ready", data: buildFleetData(state.fleet) };
      case "refreshing":
        return { kind: "refreshing", data: buildFleetData(state.fleet) };
      case "recoverable-error":
        return {
          kind: "recoverable-error",
          data: state.fleet === null ? null : buildFleetData(state.fleet),
          failure: state.failure,
          retry: state.retry,
        };
      case "terminal-error":
        return {
          kind: "terminal-error",
          data: state.fleet === null ? null : buildFleetData(state.fleet),
          issues: state.issues,
        };
    }
  }

  function getLastKnownFleet(): LastKnownFleet | null {
    switch (state.kind) {
      case "loading":
        return null;
      case "ready":
      case "refreshing":
      case "recoverable-error":
      case "terminal-error":
        return state.fleet;
    }
  }

  function setLastKnownFleet(fleet: LastKnownFleet): void {
    switch (state.kind) {
      case "loading":
        return;
      case "ready":
      case "refreshing":
        state = { kind: state.kind, fleet };
        return;
      case "recoverable-error":
      case "terminal-error":
        state = { ...state, fleet };
    }
  }

  /**
   * Row order is the map's insertion order, so it is restored on membership change alone.
   * A frame that only replaces robots leaves each one where it is, which is why ordering
   * costs nothing on the path ADR 24 measures.
   */
  function reinsertInIdOrder(): void {
    const ordered = [...robotsById.entries()].sort(([left], [right]) =>
      compareRobotIds(left, right),
    );
    robotsById.clear();
    for (const [robotId, robot] of ordered) robotsById.set(robotId, robot);
  }

  function replaceFleetFromSnapshot(snapshot: FleetSnapshot): void {
    // The snapshot is the whole fleet: a robot missing from it has left the manifest
    // and must not survive as a stale row.
    robotsById.clear();
    for (const entry of snapshot.robots) {
      const robot = "receivedAt" in entry ? toRobot(entry) : toRegisteredRobot(entry);
      robotsById.set(robot.id, robot);
    }
    reinsertInIdOrder();
  }

  function snapshotStart(): void {
    // Refresh only over settled rows: a retry after a first-load failure has nothing
    // to retain, and showing one would be a phantom refresh.
    const fleet = getLastKnownFleet();
    const next: FleetStoreState =
      fleet === null ? { kind: "loading" } : { kind: "refreshing", fleet };
    // Reconnect backoff starts an attempt per retry (ADR 31), so this is reached
    // repeatedly with nothing to say; waking subscribers would re-render the fleet to
    // show what is already on screen.
    if (next.kind === state.kind) return;
    state = next;
    notifySubscribers();
  }

  function applySnapshot(snapshot: FleetSnapshot): void {
    replaceFleetFromSnapshot(snapshot);
    // A snapshot opens a new provenance epoch: the latest-frame instant restarts, and
    // the replayed frames re-establish it (ADR 31).
    state = {
      kind: "ready",
      fleet: { sites: snapshot.sites, capturedAt: snapshot.capturedAt, latestFrameAt: null },
    };
    notifySubscribers();
  }

  function applyBatch(batch: TelemetryBatch): void {
    if (batch.robots.length === 0) return;
    // Applying a frame before the snapshot would leave `getRobot` answering for a
    // robot no resource state lists.
    const fleet = getLastKnownFleet();
    if (fleet === null) return;
    let joinedFleet = false;
    for (const envelope of batch.robots) {
      joinedFleet ||= !robotsById.has(envelope.robotId);
      robotsById.set(envelope.robotId, toRobot(envelope));
    }
    if (joinedFleet) reinsertInIdOrder();
    setLastKnownFleet({ ...fleet, latestFrameAt: batch.sentAt });
    notifySubscribers();
  }

  function recoverableFailure(failure: FleetRecoverableFailure, retry: Retry): void {
    state = { kind: "recoverable-error", fleet: getLastKnownFleet(), failure, retry };
    notifySubscribers();
  }

  function terminalFailure(issues: readonly ContractIssue[]): void {
    state = { kind: "terminal-error", fleet: getLastKnownFleet(), issues };
    notifySubscribers();
  }

  function getState(): FleetResourceState {
    cachedState ??= buildResourceState();
    return cachedState;
  }

  function getRobot(robotId: string): Robot | undefined {
    return robotsById.get(robotId);
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    snapshotStart,
    applySnapshot,
    applyBatch,
    recoverableFailure,
    terminalFailure,
    getState,
    getRobot,
    subscribe,
  };
}
