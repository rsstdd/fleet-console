import type { ContractIssue, FleetSite, FleetSnapshot, TelemetryBatch } from "@fleet/contracts";
import { toRegisteredRobot, toRobot } from "@/utils/fromEnvelope";
import type { Robot } from "@/types/robot";

export interface FleetData {
  readonly robots: readonly Robot[];
  readonly sites: readonly FleetSite[];
  readonly capturedAt: number;
}

export type FleetState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: FleetData }
  | {
      readonly kind: "recoverable-error";
      readonly data: FleetData | null;
      readonly cause: string;
    }
  | {
      readonly kind: "terminal-error";
      readonly data: FleetData | null;
      readonly issues: readonly ContractIssue[];
    };

export interface FleetStore {
  applySnapshot(snapshot: FleetSnapshot): void;
  applyBatch(batch: TelemetryBatch): void;
  recoverableFailure(cause: string): void;
  terminalFailure(issues: readonly ContractIssue[]): void;
  getState(): FleetState;
  getRobot(robotId: string): Robot | undefined;
  subscribe(listener: () => void): () => void;
}

const ROBOT_ID_ORDER = new Intl.Collator("en", { numeric: true });

export function createFleetStore(
  schedule: (notify: () => void) => void = queueMicrotask,
): FleetStore {
  const robotsById = new Map<string, Robot>();
  const listeners = new Set<() => void>();
  let sites: readonly FleetSite[] = [];
  let capturedAt = 0;
  let phase: "loading" | "ready" | "recoverable-error" | "terminal-error" = "loading";
  let cause = "";
  let issues: readonly ContractIssue[] = [];
  let cachedRobots: readonly Robot[] | null = null;
  let cachedState: FleetState | null = null;
  let scheduled = false;

  function notify(): void {
    cachedRobots = null;
    cachedState = null;
    if (scheduled) {
      return;
    }
    scheduled = true;
    schedule(() => {
      scheduled = false;
      for (const listener of listeners) {
        listener();
      }
    });
  }

  function data(): FleetData {
    cachedRobots ??= [...robotsById.values()].sort((left, right) =>
      ROBOT_ID_ORDER.compare(left.id, right.id),
    );
    return { robots: cachedRobots, sites, capturedAt };
  }

  return {
    applySnapshot(snapshot) {
      robotsById.clear();
      for (const robot of snapshot.robots) {
        robotsById.set(
          robot.robotId,
          "receivedAt" in robot ? toRobot(robot) : toRegisteredRobot(robot),
        );
      }
      sites = snapshot.sites;
      capturedAt = snapshot.capturedAt;
      phase = "ready";
      notify();
    },

    applyBatch(batch) {
      for (const envelope of batch.robots) {
        robotsById.set(envelope.robotId, toRobot(envelope));
      }
      if (phase === "ready") {
        notify();
      }
    },

    recoverableFailure(nextCause) {
      phase = "recoverable-error";
      cause = nextCause;
      notify();
    },

    terminalFailure(nextIssues) {
      phase = "terminal-error";
      issues = nextIssues;
      notify();
    },

    getState() {
      cachedState ??= ((): FleetState => {
        const hasData = robotsById.size > 0;
        switch (phase) {
          case "loading":
            return { kind: "loading" };
          case "ready":
            return { kind: "ready", data: data() };
          case "recoverable-error":
            return { kind: "recoverable-error", data: hasData ? data() : null, cause };
          case "terminal-error":
            return { kind: "terminal-error", data: hasData ? data() : null, issues };
        }
      })();
      return cachedState;
    },

    getRobot(robotId) {
      return robotsById.get(robotId);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
