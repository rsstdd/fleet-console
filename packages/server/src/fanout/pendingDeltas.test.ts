import { describe, expect, it } from "vitest";

import { PendingDeltaSet } from "./pendingDeltas.ts";

interface State {
  readonly battery: number;
  readonly freshness: "live" | "stale" | "unreachable" | "unknown";
}

const live = (battery: number): State => ({ battery, freshness: "live" });

describe("PendingDeltaSet", () => {
  it("is empty until something changes, so an idle flush sends nothing", () => {
    const pending = new PendingDeltaSet<State>();

    expect(pending.isEmpty).toBe(true);
    expect(pending.size).toBe(0);
  });

  it("coalesces repeated changes to one robot into its latest state", () => {
    const pending = new PendingDeltaSet<State>();

    pending.mark("R-204", live(90));
    pending.mark("R-204", live(89));
    pending.mark("R-204", live(88));

    expect(pending.size).toBe(1);
    expect(pending.drain().get("R-204")).toEqual(live(88));
  });

  it("keeps distinct robots distinct", () => {
    const pending = new PendingDeltaSet<State>();

    pending.mark("R-204", live(90));
    pending.mark("R-087", live(12));

    const drained = pending.drain();
    expect([...drained.keys()]).toEqual(["R-204", "R-087"]);
  });

  it("accepts a freshness-only transition as a real change (ADR 3)", () => {
    const pending = new PendingDeltaSet<State>();
    const observed = live(74);

    pending.mark("R-301", observed);
    pending.drain();

    // The sweep changed nothing but the derived field; it is still a delta.
    pending.mark("R-301", { battery: observed.battery, freshness: "stale" });

    expect(pending.size).toBe(1);
    expect(pending.drain().get("R-301")).toEqual({ battery: 74, freshness: "stale" });
  });

  it("empties on drain so the next flush does not resend the same robot", () => {
    const pending = new PendingDeltaSet<State>();
    pending.mark("R-204", live(90));

    expect(pending.drain().size).toBe(1);
    expect(pending.isEmpty).toBe(true);
    expect(pending.drain().size).toBe(0);
  });

  it("hands the caller a copy, not the live set", () => {
    const pending = new PendingDeltaSet<State>();
    pending.mark("R-204", live(90));

    const drained = pending.drain();
    pending.mark("R-087", live(12));

    expect([...drained.keys()]).toEqual(["R-204"]);
  });

  it("reports whether a robot is already awaiting a flush", () => {
    const pending = new PendingDeltaSet<State>();
    expect(pending.has("R-204")).toBe(false);

    pending.mark("R-204", live(90));
    expect(pending.has("R-204")).toBe(true);
  });
});
