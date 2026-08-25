import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "@fleet/contracts";

import type { FetchLike } from "@/lib/transportDecoding";

import { useRobotDetail, type RobotDetailState } from "./useRobotDetail";

const REGISTERED_ROBOT = {
  schemaVersion: SCHEMA_VERSION,
  robotId: "R-001",
  siteId: "SITE-NORTH",
  vendorId: "A",
  freshness: "unknown",
} as const;

type FetchResult = Awaited<ReturnType<FetchLike>>;

function ok(body: unknown): FetchResult {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

function failed(status: number): FetchResult {
  return { ok: false, status, json: () => Promise.reject(new Error("no body")) };
}

/**
 * Answers the robot request from `answers` in order and repeats the last one, so a test
 * can describe a first attempt and the retry after it. Health always fails: the
 * unknown-field decoration must never decide whether the page loads.
 */
function createFetch(answers: readonly FetchResult[]): FetchLike {
  let attempt = 0;
  return (url) => {
    if (url.endsWith("/health")) return Promise.resolve(failed(503));
    const answer = answers[Math.min(attempt, answers.length - 1)] ?? failed(503);
    attempt += 1;
    return Promise.resolve(answer);
  };
}

function renderDetail(answers: readonly FetchResult[]) {
  // Built once, not per render: a fresh seam identity would restart the request forever.
  const fetchLike = createFetch(answers);
  return renderHook(() =>
    useRobotDetail("R-001", { apiBaseUrl: "http://example.test/api", fetchLike }),
  );
}

async function waitForStatus(
  read: () => RobotDetailState,
  status: RobotDetailState["status"],
): Promise<RobotDetailState> {
  await waitFor(() => {
    expect(read().status).toBe(status);
  });
  return read();
}

describe("useRobotDetail", () => {
  it("reports the robot once its response decodes, despite an unreadable health response", async () => {
    const { result } = renderDetail([ok(REGISTERED_ROBOT)]);

    expect(result.current).toStrictEqual({ status: "loading" });

    const state = await waitForStatus(() => result.current, "ready");
    if (state.status !== "ready") throw new Error(`unexpected ${state.status}`);
    expect(state.robot.id).toBe("R-001");
  });

  it("answers not-found for an id the manifest does not carry", async () => {
    const { result } = renderDetail([failed(404)]);

    expect(await waitForStatus(() => result.current, "not-found")).toStrictEqual({
      status: "not-found",
      id: "R-001",
    });
  });

  it("loads the robot on the attempt after an unreachable server", async () => {
    const { result } = renderDetail([failed(503), ok(REGISTERED_ROBOT)]);
    const failure = await waitForStatus(() => result.current, "error");
    if (failure.status !== "error" || !failure.recoverable) {
      throw new Error("expected a recoverable error");
    }

    act(() => {
      failure.retry();
    });

    const state = await waitForStatus(() => result.current, "ready");
    if (state.status !== "ready") throw new Error(`unexpected ${state.status}`);
    expect(state.robot.id).toBe("R-001");
  });

  it("offers no retry when the response fails the contract, because the bytes will not change", async () => {
    const { result } = renderDetail([ok({ schemaVersion: SCHEMA_VERSION })]);

    const state = await waitForStatus(() => result.current, "error");
    if (state.status !== "error") throw new Error(`unexpected ${state.status}`);
    expect(state.recoverable).toBe(false);
    expect(state.message).toContain("did not match the canonical contract");
  });
});
