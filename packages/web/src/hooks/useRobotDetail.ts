import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { readEndpoints } from "@/config/endpoints";
import { useFleetContext } from "@/context/fleetContext";
import { fetchRobotDetail, type RobotDetailFailure } from "@/lib/transportDecoding";
import type { Robot, RobotDetail } from "@/types/robot";

export type RobotDetailState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly robot: RobotDetail }
  | { readonly kind: "error"; readonly failure: RobotDetailFailure };

/**
 * The detail request supplies diagnostics; the live fleet row supplies freshness.
 * Merging them stops this view showing a status the fleet table has already moved past.
 */
export function useRobotDetail(robotId: string): RobotDetailState {
  const { store } = useFleetContext();
  const [fetched, setFetched] = useState<{
    readonly robotId: string;
    readonly state: RobotDetailState;
  } | null>(null);
  const endpoints = useMemo(() => readEndpoints(), []);

  useEffect(() => {
    let cancelled = false;
    void fetchRobotDetail((url) => fetch(url), endpoints.robotUrl(robotId)).then((outcome) => {
      if (cancelled) {
        return;
      }
      setFetched({
        robotId,
        state: outcome.ok
          ? { kind: "ready", robot: outcome.value }
          : { kind: "error", failure: outcome.failure },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [endpoints, robotId]);

  const live: Robot | undefined = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getRobot(robotId),
  );

  // Deriving "loading" from the requested id avoids a setState on every navigation.
  return useMemo(() => {
    const state: RobotDetailState =
      fetched?.robotId === robotId ? fetched.state : { kind: "loading" };
    if (state.kind !== "ready" || live === undefined) {
      return state;
    }
    return { kind: "ready", robot: { ...state.robot, ...live } };
  }, [fetched, robotId, live]);
}
