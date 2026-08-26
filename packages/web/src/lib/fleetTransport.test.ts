import { describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, type FleetSnapshot, type TelemetryBatch } from "@fleet/contracts";
import {
  computeRetryDelayMs,
  createFleetTransport,
  type SocketHandlers,
} from "@/lib/fleetTransport";

const SESSION = "3f1a5d2c-8b7e-4c9a-9f2d-6e5b4a3c2d1e";
const OTHER_SESSION = "00000000-0000-4000-8000-000000000000";

const snapshot = (flushSequence: number): FleetSnapshot => ({
  schemaVersion: SCHEMA_VERSION,
  serverSessionId: SESSION,
  flushSequence,
  capturedAt: 1000,
  sites: [{ siteId: "SITE-NORTH", label: "North site" }],
  robots: [],
});

const batch = (flushSequence: number, serverSessionId = SESSION): TelemetryBatch => ({
  schemaVersion: SCHEMA_VERSION,
  serverSessionId,
  flushSequence,
  sentAt: 1000,
  robots: [],
});

function harness(options: { snapshotAt?: number; snapshotFails?: boolean } = {}) {
  let handlers: SocketHandlers | undefined;
  const received: TelemetryBatch[] = [];
  const snapshots: FleetSnapshot[] = [];
  const timers: (() => void)[] = [];
  let rejectedFrames = 0;

  const transport = createFleetTransport({
    endpoints: { snapshotUrl: "/api/fleet", streamUrl: "/ws" },
    openSocket: (_url, socketHandlers) => {
      handlers = socketHandlers;
      return { close: () => undefined };
    },
    fetchLike: () =>
      options.snapshotFails === true
        ? Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) })
        : Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(snapshot(options.snapshotAt ?? 5)),
          }),
    handlers: {
      onSnapshot: (value) => snapshots.push(value),
      onBatch: (value) => received.push(value),
      onConnectionState: () => undefined,
      onTerminalError: () => undefined,
      onFrameRejected: () => {
        rejectedFrames += 1;
      },
    },
    timer: { set: (onElapsed) => timers.push(onElapsed), clear: () => undefined },
    random: () => 0.5,
  });

  return {
    transport,
    received,
    snapshots,
    timers,
    get rejectedFrames() {
      return rejectedFrames;
    },
    send: (value: TelemetryBatch) => handlers?.onMessage(JSON.stringify(value)),
    sendText: (value: string) => handlers?.onMessage(value),
    open: () => handlers?.onOpen(),
    close: () => handlers?.onClose(),
    state: () => transport.state,
  };
}

describe("fleet transport join", () => {
  it("buffers frames that arrive before the snapshot, then replays only the newer ones", async () => {
    const h = harness({ snapshotAt: 5 });
    h.transport.connect();
    h.send(batch(4));
    h.send(batch(6));
    h.open();
    await vi.waitFor(() => {
      expect(h.snapshots).toHaveLength(1);
    });

    expect(h.received.map((value) => value.flushSequence)).toEqual([6]);
  });

  it("applies frames arriving after the join", async () => {
    const h = harness({ snapshotAt: 5 });
    h.transport.connect();
    h.open();
    await vi.waitFor(() => {
      expect(h.snapshots).toHaveLength(1);
    });

    h.send(batch(6));
    h.send(batch(5));
    expect(h.received.map((value) => value.flushSequence)).toEqual([6]);
  });

  it("gives up when a frame names a different server session", async () => {
    const h = harness({ snapshotAt: 5 });
    h.transport.connect();
    h.open();
    await vi.waitFor(() => {
      expect(h.snapshots).toHaveLength(1);
    });

    h.send(batch(9, OTHER_SESSION));
    expect(h.state().phase).toBe("failed");
    expect(h.state().terminalCause).toBe("session-mismatch");
  });

  it("rejects malformed JSON without dropping the connection", async () => {
    const h = harness({ snapshotAt: 5 });
    h.transport.connect();
    h.open();
    await vi.waitFor(() => {
      expect(h.snapshots).toHaveLength(1);
    });

    h.sendText("{");
    expect(h.rejectedFrames).toBe(1);
    expect(h.state().phase).toBe("connected");
  });

  it("stops probing after the initial attempt limit and reports why", async () => {
    const h = harness({ snapshotFails: true });
    h.transport.connect();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      h.close();
      await vi.waitFor(() => {
        expect(h.timers).toHaveLength(1);
      });
      h.timers.pop()?.();
    }

    h.close();
    await vi.waitFor(() => {
      expect(h.state().phase).toBe("failed");
    });
    expect(h.state().terminalCause).toBe("handshake-exhausted");
    expect(h.timers).toHaveLength(0);
  });

  it("keeps retrying without giving up once a socket has opened at least once", async () => {
    const h = harness({ snapshotAt: 5 });
    h.transport.connect();
    h.open();
    await vi.waitFor(() => {
      expect(h.snapshots).toHaveLength(1);
    });

    h.close();
    expect(h.state().phase).toBe("reconnecting");
    expect(h.state().terminalCause).toBeNull();
  });
});

describe("computeRetryDelayMs", () => {
  it("grows the ceiling exponentially and jitters below it", () => {
    expect(computeRetryDelayMs(1, () => 1)).toBe(1000);
    expect(computeRetryDelayMs(2, () => 1)).toBe(2000);
    expect(computeRetryDelayMs(3, () => 0.5)).toBe(2000);
  });

  it("caps the ceiling so a long outage does not back off forever", () => {
    expect(computeRetryDelayMs(50, () => 1)).toBe(30_000);
  });
});
