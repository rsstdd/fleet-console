import { useCallback, useEffect, useState } from "react";

import type { ContractIssue } from "@fleet/contracts";

import {
  fetchHealth,
  fetchRobotDetail,
  type FetchLike,
  type RobotDetailFailure,
  type RobotDetailResponse,
} from "@/shared/lib/transportDecoding";

import { toRegisteredRobotDetail, toRobotDetail } from "./fromEnvelope";
import type { RobotDetail } from "./model";

/**
 * One robot, fetched from `GET /api/robots/:id` and decoded at the boundary.
 *
 * The state union below was written for this transport before it existed and did not
 * change when it landed: `loading` and the two error variants are here because a real
 * fetch produces them (Principle 5). What changed is only where the bytes come from.
 *
 * **Two requests, not one, and they fail differently.** The robot is the page; the health
 * counters decorate one technician field with a fleet-wide unknown-field total that no
 * envelope carries and none should (ADR 15). A failed health read leaves that one
 * field unreported and the page still renders; a failed robot read is the page's failure.
 *
 * No freshness timer, here or anywhere. Freshness arrives as a field the server sweep set
 * (ADR 3).
 */

/**
 * Every user-visible state of the single-robot surface (robot detail spec
 * §10). A union rather than a bag of booleans: "loading and not found" and
 * "ready with no robot" are not representable (Principle 11).
 */
export type RobotDetailState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly robot: RobotDetail }
  | { readonly status: "not-found"; readonly id: string }
  /**
   * Recoverable: whatever is already valid stays on screen and the page offers
   * a retry, rather than blanking (spec §10). `robot` is null only when the
   * first load itself failed.
   */
  | {
      readonly status: "error";
      readonly recoverable: true;
      readonly message: string;
      readonly robot: RobotDetail | null;
      readonly retry: () => void;
    }
  /** Terminal: nothing more will arrive, so the page states what failed. */
  | {
      readonly status: "error";
      readonly recoverable: false;
      readonly message: string;
      readonly robot: null;
    };

/**
 * One line naming what failed to decode, for the terminal error state.
 *
 * Coupling: `ContractIssue` is the repository's one failure vocabulary (ADR 20),
 * so these are the decoder's own issues and the ones an HTTP error body carries
 * (`parseErrorEnvelope` in `@fleet/contracts`).
 * The console composes its own sentence from `path` and `code`; the envelope's
 * server-authored `message` is for logs and non-console callers, not for this.
 */
function describeIssues(issues: readonly ContractIssue[]): string {
  const summary = issues.map((issue) => `${issue.path}: ${issue.code}`).join(", ");
  return `The robot response did not match the canonical contract (${summary}).`;
}

/** Maps one decoded response onto the detail read model. */
function toDetail(response: RobotDetailResponse, unknownFieldCount: number | null): RobotDetail {
  return response.observed
    ? toRobotDetail(response.envelope, { unknownFieldCount })
    : toRegisteredRobotDetail(response.registered);
}

/** Maps one fetch failure onto the state the page renders for it. */
function failureState(
  failure: RobotDetailFailure,
  id: string,
  retry: () => void,
): RobotDetailState {
  switch (failure.kind) {
    case "not-found":
      // A wrong link, not a fault: the page offers a way back to Fleet (spec §10).
      return { status: "not-found", id };
    case "unreachable":
      return {
        status: "error",
        recoverable: true,
        message: "The robot could not be loaded. The server did not answer.",
        robot: null,
        retry,
      };
    case "contract":
      // Terminal: the server did not stumble, it sent bytes this console cannot read, and
      // retrying returns the same bytes (ADR 20).
      return {
        status: "error",
        recoverable: false,
        message: describeIssues(failure.issues),
        robot: null,
      };
  }
}

/**
 * Loads one robot, re-loading when the id changes and offering a retry when it fails.
 *
 * `apiBaseUrl` is a parameter rather than a `TENANT` read because `entities` may not import
 * `config` (ADR 4) — the address is deployment configuration and belongs to a layer that is
 * allowed to know it. `fetchLike` is injectable so a test can assert which outcome maps to
 * which state without a network; the default is the platform `fetch`.
 */
export function useRobotDetail(
  id: string | undefined,
  ports: { readonly apiBaseUrl: string; readonly fetchLike?: FetchLike },
): RobotDetailState {
  /**
   * The loaded state **and the id it describes**, together.
   *
   * Two fields rather than one, so switching robots shows `loading` by derivation instead
   * of by a `setState` inside the effect — which React's own lint rule rejects as a
   * cascading render, and which would also flash the previous robot's data under the new
   * robot's heading for one frame.
   */
  const [loaded, setLoaded] = useState<{ forId: string; value: RobotDetailState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { apiBaseUrl, fetchLike } = ports;

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  useEffect(() => {
    if (id === undefined || id === "") return;

    const request: FetchLike = fetchLike ?? ((url) => fetch(url));
    // An `AbortController` rather than a captured boolean: the compiler cannot see that a
    // cleanup closure flips a `let` across an await, so it narrows the flag to `true` and
    // the guard reads as dead code. `signal.aborted` is honest to both the reader and the
    // analyzer, and it is the handle a cancelling `fetch` would want anyway.
    const cancellation = new AbortController();

    void (async () => {
      const [robot, health] = await Promise.all([
        fetchRobotDetail(request, `${apiBaseUrl}/robots/${encodeURIComponent(id)}`),
        fetchHealth(request, `${apiBaseUrl}/health`),
      ]);
      // The id changed or the page unmounted while these were in flight, so this describes
      // a robot nobody is looking at any more.
      if (cancellation.signal.aborted) return;

      if (robot.ok) {
        const vendorId = robot.robot.observed
          ? robot.robot.envelope.vendorId
          : robot.robot.registered.vendorId;
        // Null rather than zero when health could not be read: zero is a measurement, and
        // claiming one nobody took is the failure Principle 4 names.
        const unknownFieldCount = health.ok
          ? (health.health.byAdapter[vendorId]?.unknownFields.total ?? null)
          : null;
        setLoaded({
          forId: id,
          value: { status: "ready", robot: toDetail(robot.robot, unknownFieldCount) },
        });
        return;
      }

      setLoaded({ forId: id, value: failureState(robot.failure, id, retry) });
    })();

    return () => {
      cancellation.abort();
    };
  }, [id, attempt, apiBaseUrl, fetchLike, retry]);

  // An absent id never had a robot to fetch, and a result for a different robot is not
  // this robot's answer — both are derived rather than written.
  if (id === undefined || id === "") return { status: "not-found", id: "" };
  return loaded !== null && loaded.forId === id ? loaded.value : { status: "loading" };
}
