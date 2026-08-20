import { describe, expect, it } from "vitest";

import { type CanonicalEnvelope, SCHEMA_VERSION, parseTelemetryBatch } from "@fleet/contracts";

import { fixedClock } from "../runtime/clock.ts";
import { createFlushSequence, DeltaFanOut, type FanOutClient } from "./deltaFanOut.ts";

/** A console that records what it was sent, standing in for a socket. */
function recorder(): FanOutClient & { readonly frames: string[]; closed: boolean } {
  const frames: string[] = [];
  return {
    frames,
    closed: false,
    send(frame) {
      frames.push(frame);
    },
    close() {
      this.closed = true;
    },
  };
}

const SENT_AT = 1_755_600_000_000;

function envelope(robotId: string, freshness: CanonicalEnvelope["freshness"]): CanonicalEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    robotId,
    siteId: "site-a",
    vendorId: "A",
    model: "sweeper-2000",
    adapterId: "vendor-a",
    adapterVersion: "1.0.0",
    reportedAt: SENT_AT - 500,
    receivedAt: SENT_AT - 100,
    freshness,
    core: {
      connectivity: "unknown",
      batteryPercent: 50,
      position: null,
      status: "idle",
      health: { severity: "nominal" },
    },
    capabilities: { dock: { docked: true, dockId: "dock-1" } },
  };
}

describe("DeltaFanOut", () => {
  function fanOut(): DeltaFanOut {
    return new DeltaFanOut({ clock: fixedClock(SENT_AT), sequence: createFlushSequence() });
  }

  it("sends a frame the contract's own decoder accepts", () => {
    // The capability record has to reach the wire as an array, or the console's decode
    // fails in a way that reads like a transport fault (**H5**, ADR 1).
    const client = recorder();
    const out = fanOut();
    out.add(client);
    out.mark("rbt-1", envelope("rbt-1", "live"));

    out.flush();

    const parsed = parseTelemetryBatch(JSON.parse(client.frames[0] ?? "null"));
    expect(parsed.ok).toBe(true);
    expect(JSON.parse(client.frames[0] ?? "{}")).toMatchObject({
      flushSequence: 1,
      sentAt: SENT_AT,
      robots: [{ robotId: "rbt-1", capabilities: [{ name: "dock" }] }],
    });
  });

  it("coalesces repeated changes to one entry per robot", () => {
    const client = recorder();
    const out = fanOut();
    out.add(client);
    out.mark("rbt-1", envelope("rbt-1", "live"));
    out.mark("rbt-1", envelope("rbt-1", "stale"));
    out.mark("rbt-2", envelope("rbt-2", "live"));

    out.flush();

    // Decoded through the contract rather than read off `JSON.parse`, so the assertion
    // is about the frame a console would actually receive.
    const parsed = parseTelemetryBatch(JSON.parse(client.frames[0] ?? "null"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.robots).toHaveLength(2);
    expect(parsed.value.robots[0]).toMatchObject({ robotId: "rbt-1", freshness: "stale" });
  });

  it("gives each console its own set, so one draining does not rob another", () => {
    // The whole reason ADR 2 was amended to per-client sets. With one shared set the
    // second console below receives nothing.
    const [first, second] = [recorder(), recorder()];
    const out = fanOut();
    out.add(first);
    out.add(second);
    out.mark("rbt-1", envelope("rbt-1", "live"));

    out.flush();

    expect(first.frames).toHaveLength(1);
    expect(second.frames).toHaveLength(1);
  });

  it("does not advance the sequence on a flush that sends nothing", () => {
    // A counter that climbed on empty ticks would describe no state, and a client
    // reconciling a delta against its snapshot would discard readings it needed (ADR 18).
    const client = recorder();
    const out = fanOut();
    out.add(client);

    out.flush();
    out.flush();
    out.mark("rbt-1", envelope("rbt-1", "live"));
    out.flush();

    expect(client.frames).toHaveLength(1);
    expect(JSON.parse(client.frames[0] ?? "{}")).toMatchObject({ flushSequence: 1 });
  });

  it("sends nothing to a console that joined after the change", () => {
    // A joining console's picture is the GET /api/fleet snapshot, not a replay (**H3**).
    const out = fanOut();
    out.mark("rbt-1", envelope("rbt-1", "live"));
    const late = recorder();
    out.add(late);

    out.flush();

    expect(late.frames).toHaveLength(0);
  });

  it("closes every console on stop, so no frame lands on a dead listener", () => {
    // ADR 8 § Implications requires clients to close before the HTTP server does.
    const client = recorder();
    const out = fanOut();
    out.add(client);
    out.start();

    out.stop();

    expect(client.closed).toBe(true);
    expect(out.clientCount).toBe(0);
    expect(out.isRunning).toBe(false);
  });
});
