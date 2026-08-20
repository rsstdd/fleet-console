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
    flushSequence: 0,
    capturedAt: 0,
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

    expect(result.current.connectionState).toBe("reconnecting");
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
      expect(result.current.store.getRobots().map((robot) => robot.id)).toStrictEqual(["R-001"]);
    });
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

  it("surfaces a terminal contract failure and clears it on retry", async () => {
    // W-6: retrying returns the same bytes, so the failure has to be visible — and the
    // retry has to clear it, or the banner shows an error over a connection that is trying.
    const { control, openSocket, fetchLike } = ports({ schemaVersion: SCHEMA_VERSION });
    const { result } = renderHook(() => useFleetTransport({ openSocket, fetchLike }));
    act(() => control.open?.());

    await waitFor(() => {
      expect(result.current.contractFailure).not.toBeNull();
    });
    expect(result.current.connectionState).toBe("disconnected");

    act(() => {
      result.current.retry();
    });
    expect(result.current.contractFailure).toBeNull();
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
