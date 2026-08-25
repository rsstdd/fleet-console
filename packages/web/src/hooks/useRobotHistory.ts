import type { ContractIssue, RobotBatteryHistory } from "@fleet/contracts";

import {
  fetchBatteryHistory,
  type BatteryHistoryFailure,
  type FetchLike,
} from "@/lib/transportDecoding";

import { useFetchedResource, type FetchedResourceContext } from "./useFetchedResource";

export type RobotHistoryState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly history: RobotBatteryHistory }
  | {
      readonly status: "error";
      readonly recoverable: true;
      /** An attempt is running; the section still shows the failure it followed. */
      readonly retrying: boolean;
      readonly retry: () => void;
    }
  | { readonly status: "error"; readonly recoverable: false; readonly message: string };

function describeIssues(issues: readonly ContractIssue[]): string {
  const summary = issues.map((issue) => `${issue.path}: ${issue.code}`).join(", ");
  return `The battery history response did not match its contract (${summary}).`;
}

function buildFailureState(failure: BatteryHistoryFailure, retry: () => void): RobotHistoryState {
  switch (failure.kind) {
    case "unreachable":
      return { status: "error", recoverable: true, retrying: false, retry };
    case "contract":
      return {
        status: "error",
        recoverable: false,
        message: describeIssues(failure.issues),
      };
  }
}

async function loadRobotHistory(
  request: FetchLike,
  { id, apiBaseUrl, retry }: FetchedResourceContext,
): Promise<RobotHistoryState> {
  const outcome = await fetchBatteryHistory(
    request,
    `${apiBaseUrl}/robots/${encodeURIComponent(id)}/history`,
  );
  return outcome.ok
    ? { status: "ready", history: outcome.history }
    : buildFailureState(outcome.failure, retry);
}

/**
 * Fetched once per id and never joined to the delta store, which would turn one
 * historical read into a frame-rate poll (ADR 33).
 */
export function useRobotHistory(
  id: string,
  ports: { readonly apiBaseUrl: string; readonly fetchLike?: FetchLike },
): RobotHistoryState {
  const { value, isReloading } = useFetchedResource(id, ports, loadRobotHistory);
  return isReloading && value.status === "error" && value.recoverable
    ? { ...value, retrying: true }
    : value;
}
