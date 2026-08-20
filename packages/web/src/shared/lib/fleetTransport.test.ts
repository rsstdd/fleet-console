import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "@fleet/contracts";
import type { FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

import { createFleetTransport, type OpenSocket } from "./fleetTransport";
import type { FetchLike } from "./transportDecoding";

/**
 * The sequencing, which is the one part of the transport no pure unit could test: open,
 * buffer, fetch, reconcile, replay. Everything the pieces do on their own is already
 * covered by `coldStart`, `streamLifecycle` and `transportDecoding`.
 */
describe("createFleetTransport", () => {
  function snapshot(flushSequence: number): FleetSnapshot {
    return { schemaVersion: SCHEMA_VERSION, flushSequence, capturedAt: 0, robots: [] };
  }

  function batch(flushSequence: number): TelemetryBatch {
    return { schemaVersion: SCHEMA_VERSION, flushSequence, sentAt: 0, robots: [] };
  }

  /** A socket whose lifecycle the test drives, and which records nothing it is not asked. */
  function controllableSocket() {
    const control: {
      open?: () => void;
      message?: (data: string) => void;
      close?: () => void;
      closed: boolean;
      opened: number;
    } = { closed: false, opened: 0 };

    const openSocket: OpenSocket = (_url, handlers) => {
      control.opened += 1;
      control.open = handlers.onOpen;
      control.message = handlers.onMessage;
      control.close = handlers.onClose;
      return {
        close: () => {
          control.closed = true;
        },
      };
    };
    return { control, openSocket };
  }

  function harness(options: { fetchLike: FetchLike }) {
    const { control, openSocket } = controllableSocket();
    const snapshots: FleetSnapshot[] = [];
    const batches: TelemetryBatch[] = [];
    const states: string[] = [];
    const terminal: unknown[] = [];
    let rejected = 0;

    const transport = createFleetTransport({
      endpoints: { snapshotUrl: "/api/fleet", streamUrl: "/ws" },
      openSocket,
      fetchLike: options.fetchLike,
      handlers: {
        onSnapshot: (value) => snapshots.push(value),
        onBatch: (value) => batches.push(value),
        onConnectionState: (published) => states.push(published),
        onTerminalError: (issues) => terminal.push(issues),
        onFrameRejected: () => {
          rejected += 1;
        },
      },
    });

    return {
      transport,
      control,
      snapshots,
      batches,
      states,
      terminal,
      rejectedCount: () => rejected,
    };
  }

  /** Lets the injected fetch's promise chain settle; the transport awaits two of them. */
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  const serving =
    (body: unknown): FetchLike =>
    () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

  it("opens the socket before fetching, and replays what the snapshot missed", async () => {
    // The whole reason this order exists. Flush 4 arrived while the snapshot (captured at
    // 3) was in flight; it is the console's only copy of that change.
    const h = harness({ fetchLike: serving(snapshot(3)) });
    h.transport.connect();
    h.control.open?.();
    h.control.message?.(JSON.stringify(batch(4)));
    await flush();

    expect(h.snapshots).toHaveLength(1);
    expect(h.batches.map((b) => b.flushSequence)).toStrictEqual([4]);
  });

  it("discards a buffered frame the snapshot already covers", async () => {
    const h = harness({ fetchLike: serving(snapshot(5)) });
    h.transport.connect();
    h.control.open?.();
    h.control.message?.(JSON.stringify(batch(5)));
    await flush();

    expect(h.batches).toHaveLength(0);
  });

  it("passes a frame straight through once the snapshot has landed", async () => {
    const h = harness({ fetchLike: serving(snapshot(1)) });
    h.transport.connect();
    h.control.open?.();
    await flush();
    h.control.message?.(JSON.stringify(batch(2)));

    expect(h.batches.map((b) => b.flushSequence)).toStrictEqual([2]);
  });

  it("publishes reconnecting while connecting and connected once open", () => {
    const h = harness({ fetchLike: serving(snapshot(0)) });

    h.transport.connect();
    expect(h.states).toStrictEqual(["reconnecting"]);

    h.control.open?.();
    expect(h.states).toStrictEqual(["reconnecting", "connected"]);
    // Reported on every transition, not only when the published value moves: an attempt
    // can increment while the banner still says "reconnecting".
    expect(h.transport.state.attempt).toBe(0);
  });

  it("gives up on a body the contract refuses, rather than retrying the same bytes", async () => {
    // W-6: the server did not stumble; retrying returns the same bytes.
    const h = harness({ fetchLike: serving({ schemaVersion: SCHEMA_VERSION }) });
    h.transport.connect();
    h.control.open?.();
    await flush();

    expect(h.terminal).toHaveLength(1);
    expect(h.transport.state.phase).toBe("failed");
    expect(h.states.at(-1)).toBe("disconnected");
  });

  it("leaves the socket alone when the snapshot request merely fails", async () => {
    // Reporting a connection failure for a failed HTTP read would blame the wrong
    // transport; the stream may still be delivering.
    const h = harness({
      fetchLike: () =>
        Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null) }),
    });
    h.transport.connect();
    h.control.open?.();
    await flush();

    expect(h.terminal).toHaveLength(0);
    expect(h.transport.state.phase).toBe("connected");
  });

  it("counts a frame it cannot decode and keeps the connection", () => {
    const h = harness({ fetchLike: serving(snapshot(0)) });
    h.transport.connect();
    h.control.open?.();

    h.control.message?.("<html>proxy error</html>");

    expect(h.rejectedCount()).toBe(1);
    expect(h.transport.state.phase).toBe("connected");
  });

  it("drops a snapshot that lands after its own socket closed", async () => {
    // Otherwise a stale fleet overwrites the one the new connection just fetched.
    const h = harness({ fetchLike: serving(snapshot(0)) });
    h.transport.connect();
    h.control.open?.();
    h.transport.disconnect();
    await flush();

    expect(h.snapshots).toHaveLength(0);
  });

  it("reports a close after being connected as reconnecting, not as a first connect", () => {
    const h = harness({ fetchLike: serving(snapshot(0)) });
    h.transport.connect();
    h.control.open?.();
    h.control.close?.();

    expect(h.transport.state.phase).toBe("reconnecting");
    expect(h.transport.state.lastConnectedAt).not.toBeNull();
  });
});
