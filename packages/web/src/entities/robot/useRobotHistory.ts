import { useCallback, useEffect, useState } from "react";

import type { ContractIssue, RobotBatteryHistory } from "@fleet/contracts";

import {
  fetchBatteryHistory,
  type BatteryHistoryFailure,
  type FetchLike,
} from "@/shared/lib/transportDecoding";

/**
 * One robot's battery history, fetched from `GET /api/robots/:id/history` once
 * per visit and decoded at the boundary (ADR 33).
 *
 * Deliberately a separate resource from `useRobotDetail`, with a separate
 * failure lifecycle: history decorates the detail page, so its failure must
 * never blank otherwise-valid robot data — the section degrades inline while
 * the page stands. It is fetch-on-visit, not streamed, and does not join the
 * delta store: a sparkline that refetched on every live update would turn one
 * historical read into a 10 Hz poll.
 *
 * No client-side freshness reasoning: `capturedAt` and every point timestamp
 * are server receipt times, rendered as explicitly historical (ADR 3).
 */

/** Every user-visible state of the battery-history section (Principle 5). */
export type RobotHistoryState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly history: RobotBatteryHistory }
  /** Recoverable: the request failed, the section offers an inline retry. */
  | { readonly status: "error"; readonly recoverable: true; readonly retry: () => void }
  /** Terminal: the response failed the contract, and retrying returns the same bytes. */
  | { readonly status: "error"; readonly recoverable: false; readonly message: string };

/** One line naming what failed to decode, for the terminal state. */
function describeIssues(issues: readonly ContractIssue[]): string {
  const summary = issues.map((issue) => `${issue.path}: ${issue.code}`).join(", ");
  return `The battery history response did not match its contract (${summary}).`;
}

/** Maps one fetch failure onto the state the section renders for it. */
function failureState(failure: BatteryHistoryFailure, retry: () => void): RobotHistoryState {
  return failure.kind === "unreachable"
    ? { status: "error", recoverable: true, retry }
    : { status: "error", recoverable: false, message: describeIssues(failure.issues) };
}

/**
 * Loads one robot's battery history, re-loading when the id changes and
 * offering a retry when the request (not the contract) fails.
 *
 * `apiBaseUrl` is a parameter because `entities` may not import `config`
 * (ADR 4); `fetchLike` is injectable for the same reason `useRobotDetail`'s is.
 */
export function useRobotHistory(
  id: string,
  ports: { readonly apiBaseUrl: string; readonly fetchLike?: FetchLike },
): RobotHistoryState {
  // The loaded state and the id it describes, together, so switching robots
  // derives `loading` instead of flashing the previous robot's chart.
  const [loaded, setLoaded] = useState<{ forId: string; value: RobotHistoryState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { apiBaseUrl, fetchLike } = ports;

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  useEffect(() => {
    const request: FetchLike = fetchLike ?? ((url) => fetch(url));
    const cancellation = new AbortController();

    void (async () => {
      const outcome = await fetchBatteryHistory(
        request,
        `${apiBaseUrl}/robots/${encodeURIComponent(id)}/history`,
      );
      if (cancellation.signal.aborted) return;

      setLoaded({
        forId: id,
        value: outcome.ok
          ? { status: "ready", history: outcome.history }
          : failureState(outcome.failure, retry),
      });
    })();

    return () => {
      cancellation.abort();
    };
  }, [id, attempt, apiBaseUrl, fetchLike, retry]);

  return loaded !== null && loaded.forId === id ? loaded.value : { status: "loading" };
}
