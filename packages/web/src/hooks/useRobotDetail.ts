import type { ContractIssue } from "@fleet/contracts";

import {
  fetchHealth,
  fetchRobotDetail,
  type FetchLike,
  type RobotDetailFailure,
  type RobotDetailResponse,
} from "@/lib/transportDecoding";

import { toRegisteredRobotDetail, toRobotDetail } from "@/utils/fromEnvelope";
import type { RobotDetail } from "@/types/robot";
import { useFetchedResource, type FetchedResourceContext } from "./useFetchedResource";

/**
 * No error variant carries a robot, because this resource is fetched once per visit: a
 * failure means nothing decoded, and a success is never followed by one. Spec §10's
 * retention is served from the live fleet row in `robotDetailPage.tsx`, not from here.
 */
export type RobotDetailState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly robot: RobotDetail }
  | { readonly status: "not-found"; readonly id: string }
  | {
      readonly status: "error";
      readonly recoverable: true;
      readonly message: string;
      /** An attempt is running; `message` still describes the one that failed. */
      readonly retrying: boolean;
      readonly retry: () => void;
    }
  | {
      readonly status: "error";
      readonly recoverable: false;
      readonly message: string;
    };

function describeIssues(issues: readonly ContractIssue[]): string {
  const summary = issues.map((issue) => `${issue.path}: ${issue.code}`).join(", ");
  return `The robot response did not match the canonical contract (${summary}).`;
}

function mapResponseToDetail(
  response: RobotDetailResponse,
  unknownFieldCount: number | null,
): RobotDetail {
  return response.observed
    ? toRobotDetail(response.envelope, { unknownFieldCount })
    : toRegisteredRobotDetail(response.registered);
}

function buildFailureState(
  failure: RobotDetailFailure,
  id: string,
  retry: () => void,
): RobotDetailState {
  switch (failure.kind) {
    case "not-found":
      return { status: "not-found", id };
    case "unreachable":
      return {
        status: "error",
        recoverable: true,
        message: "The robot could not be loaded. The server did not answer.",
        retrying: false,
        retry,
      };
    case "contract":
      // Contract-invalid bytes are terminal: retrying cannot change them, and nothing
      // decoded from them may stay on screen.
      return { status: "error", recoverable: false, message: describeIssues(failure.issues) };
  }
}

async function loadRobotDetail(
  request: FetchLike,
  { id, apiBaseUrl, retry }: FetchedResourceContext,
): Promise<RobotDetailState> {
  const [robot, health] = await Promise.all([
    fetchRobotDetail(request, `${apiBaseUrl}/robots/${encodeURIComponent(id)}`),
    fetchHealth(request, `${apiBaseUrl}/health`),
  ]);

  if (robot.ok) {
    const vendorId = robot.robot.observed
      ? robot.robot.envelope.vendorId
      : robot.robot.registered.vendorId;
    // Null means health was unavailable; zero is a measured count.
    const unknownFieldCount = health.ok
      ? (health.health.byAdapter[vendorId]?.unknownFields.total ?? null)
      : null;
    return { status: "ready", robot: mapResponseToDetail(robot.robot, unknownFieldCount) };
  }

  return buildFailureState(robot.failure, id, retry);
}

/** Only the robot request can fail this page; an unread health total is reported as absent. */
export function useRobotDetail(
  id: string,
  ports: { readonly apiBaseUrl: string; readonly fetchLike?: FetchLike },
): RobotDetailState {
  const { value, isReloading } = useFetchedResource(id, ports, loadRobotDetail);
  return isReloading && value.status === "error" && value.recoverable
    ? { ...value, retrying: true }
    : value;
}
