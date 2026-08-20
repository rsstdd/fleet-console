import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "@fleet/contracts";

import type { OpenSocket } from "@/shared/lib/fleetTransport";
import type { FetchLike } from "@/shared/lib/transportDecoding";

import { resolveStreamUrl, useFleetTransport } from "./useFleetTransport";

/**
 * The transport boundary as the shell sees it. The sequencing itself is covered by
 * `fleetTransport`; what is asserted here is the hook's own contract — that it connects
 * once, publishes what the banner renders, and closes the socket when the console goes
 * away.
 */
describe("useFleetTransport", () => {
  const SNAPSHOT = {
    schemaVersion: SCHEMA_VERSION,
    serverSessionId: "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b",
    flushSequence: 0,
    capturedAt: 0,
    sites: [{ siteId: "SITE-NORTH", label: "North site" }],
    robots: [
      {
        schemaVersion: SCHEMA_VERSION,
        robotId: "R-001",
        siteId: "SITE-NORTH",
        vendorId: "A",
        freshness: "unknown",
      },
    ],
  };

  function ports(body: unknown = SNAPSHOT) {
    const control: { open?: () => void; close?: () => void; closed: boolean; opened: number } = {
      closed: false,
      opened: 0,
    };
    const openSocket: OpenSocket = (_url, handlers) => {
      control.opened += 1;
      control.open = handlers.onOpen;
      control.close = handlers.onClose;
      return {
        close: () => {
          control.closed = true;
        },
      };
    };
    const fetchLike: FetchLike = () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    return { control, openSocket, fetchLike };
  }

  it("starts disconnected and reports connected once the socket opens", async () => {
    const { control, openSocket, fetchLike } = ports();
    const { result } = renderHook(() => useFleetTransport({ openSocket, fetchLike }));

    // `connecting`, not `reconnecting`: nothing has ever been received (ADR 31).
    expect(result.current.connectionState).toBe("connecting");
    act(() => control.open?.());

    await waitFor(() => {
      expect(result.current.connectionState).toBe("connected");
    });
    expect(result.current.lastEventAt).not.toBeNull();
  });

  it("seeds the store from the snapshot the socket's open triggered", async () => {
    const { control, openSocket, fetchLike } = ports();
    const { result } = renderHook(() => useFleetTransport({ openSocket, fetchLike }));
    act(() => control.open?.());

    await waitFor(() => {
      expect(result.current.store.getRobot("R-001")?.id).toBe("R-001");
    });
    // The explicit snapshot-success transition: the resource settles ready
    // with the snapshot's directory and provenance retained.
    const state = result.current.store.getState();
    if (state.kind !== "ready") throw new Error(`unexpected ${state.kind}`);
    expect(state.data.sites).toStrictEqual([{ siteId: "SITE-NORTH", label: "North site" }]);
  });

  it("opens exactly one socket, however often it re-renders", () => {
    const { control, openSocket, fetchLike } = ports();
    const { rerender } = renderHook(() => useFleetTransport({ openSocket, fetchLike }));

    rerender();
    rerender();

    expect(control.opened).toBe(1);
  });

  it("closes the socket when the console unmounts", () => {
    const { control, openSocket, fetchLike } = ports();
    const { unmount } = renderHook(() => useFleetTransport({ openSocket, fetchLike }));

    unmount();

    expect(control.closed).toBe(true);
  });

  it("drives the store terminal on a contract failure, and back to loading on retry", async () => {
    // Retrying returns the same bytes, so the failure lands in the resource
    // state the fleet page renders — with the decoder's own issues — rather
    // than in a hook field nothing consumed.
    const { control, openSocket, fetchLike } = ports({ schemaVersion: SCHEMA_VERSION });
    const { result } = renderHook(() => useFleetTransport({ openSocket, fetchLike }));
    act(() => control.open?.());

    await waitFor(() => {
      expect(result.current.store.getState().kind).toBe("terminal-error");
    });
    const failed = result.current.store.getState();
    if (failed.kind !== "terminal-error") throw new Error(`unexpected ${failed.kind}`);
    expect(failed.issues.length).toBeGreaterThan(0);
    expect(result.current.connectionState).toBe("disconnected");
    // The cause travels with the state, so the banner can say why retrying stopped.
    expect(result.current.terminalCause).toBe("contract");

    act(() => {
      result.current.retry();
    });
    expect(result.current.terminalCause).toBeNull();
    // A fresh attempt with nothing retained reads as loading, not as a stale error.
    expect(result.current.store.getState().kind).toBe("loading");
  });
});

describe("resolveStreamUrl", () => {
  it("turns the tenant's same-origin path into a socket URL from the page's origin", () => {
    // The origin comes from the page, never from configuration: a console that knew the
    // server's real address would stop being same-origin (ADR 21).
    expect(resolveStreamUrl("/ws", "http://localhost:5173")).toBe("ws://localhost:5173/ws");
    expect(resolveStreamUrl("/ws", "https://console.example.com")).toBe(
      "wss://console.example.com/ws",
    );
  });

  it("leaves an absolute socket URL alone", () => {
    expect(resolveStreamUrl("wss://stream.example.com/ws", "https://a.test")).toBe(
      "wss://stream.example.com/ws",
    );
  });
});
