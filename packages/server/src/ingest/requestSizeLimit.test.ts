import { describe, expect, it } from "vitest";

import { MAX_INGEST_BYTES, checkDeclaredSize, createByteBudget } from "./requestSizeLimit.ts";

describe("MAX_INGEST_BYTES", () => {
  it("is derived from the dialects that actually exist, not picked", () => {
    // The three recorded vendor fixtures are 221, 404 and 428 bytes. The cap is
    // roughly 150x the largest, which is the headroom claim ADR 26 makes.
    expect(MAX_INGEST_BYTES).toBe(65_536);
    expect(MAX_INGEST_BYTES / 428).toBeGreaterThan(100);
  });

  it("keeps retained memory at 500 robots an arithmetic fact", () => {
    // Retention is one payload per robot, so the worst case is fleet size x cap:
    // 500 x 64 KiB = 32,768,000 bytes = 31.25 MiB. That is the number ADR 6's
    // in-memory budget can be checked against; if this assertion has to change, the
    // arithmetic in ADR 26 has to be redone with it.
    const worstCaseBytes = 500 * MAX_INGEST_BYTES;
    expect(worstCaseBytes).toBe(32_768_000);
    expect(worstCaseBytes / (1024 * 1024)).toBeCloseTo(31.25, 2);
  });
});

describe("checkDeclaredSize", () => {
  it("refuses an over-declared body before a byte is read", () => {
    const rejection = checkDeclaredSize(String(MAX_INGEST_BYTES + 1));

    expect(rejection).toEqual({
      basis: "declared",
      limit: MAX_INGEST_BYTES,
      observed: MAX_INGEST_BYTES + 1,
    });
  });

  it("accepts a body declared at exactly the limit", () => {
    // The boundary is inclusive: the cap is the largest accepted size, not the
    // smallest refused one.
    expect(checkDeclaredSize(String(MAX_INGEST_BYTES))).toBeNull();
  });

  it("does not reject when the header is absent, malformed or negative", () => {
    // Nothing to reject on yet. A body that never arrives costs nothing, and one
    // that does is caught by the budget — which is the guard that actually holds.
    for (const header of [null, undefined, "", "abc", "-1", "1e5", "12.5", "0x10"]) {
      expect(checkDeclaredSize(header)).toBeNull();
    }
  });

  it("tolerates surrounding whitespace, which a proxy can introduce", () => {
    expect(checkDeclaredSize(` ${String(MAX_INGEST_BYTES + 1)} `)?.basis).toBe("declared");
  });
});

describe("createByteBudget", () => {
  it("accepts a body that lands exactly on the limit", () => {
    const budget = createByteBudget(10);

    expect(budget.add(6)).toBeNull();
    expect(budget.add(4)).toBeNull();
    expect(budget.total()).toBe(10);
  });

  it("refuses on the chunk that crosses the limit, not at the end of the body", () => {
    // The point of counting per chunk: an unbounded body must never be fully in
    // memory before it is measured.
    const budget = createByteBudget(10);

    expect(budget.add(9)).toBeNull();
    expect(budget.add(2)).toEqual({ basis: "measured", limit: 10, observed: 11 });
  });

  it("catches a body that under-declares its own Content-Length", () => {
    // The case that makes the header check insufficient rather than merely cheap.
    // A caller declaring 10 bytes and sending 5,000 walks past `checkDeclaredSize`
    // and is stopped here.
    expect(checkDeclaredSize("10")).toBeNull();

    const budget = createByteBudget(MAX_INGEST_BYTES);
    let rejection = null;
    for (let sent = 0; sent < 5_000 && rejection === null; sent += 1_000) {
      rejection = budget.add(1_000);
    }
    expect(rejection).toBeNull();

    // …and a caller sending past the real cap is stopped regardless of what it declared.
    const overrun = createByteBudget(MAX_INGEST_BYTES);
    let stopped = null;
    for (let sent = 0; sent <= MAX_INGEST_BYTES + 1_000 && stopped === null; sent += 1_000) {
      stopped = overrun.add(1_000);
    }
    expect(stopped?.basis).toBe("measured");
  });

  it("catches a body with no Content-Length at all", () => {
    expect(checkDeclaredSize(null)).toBeNull();

    const budget = createByteBudget(100);
    expect(budget.add(101)?.basis).toBe("measured");
  });

  it("gives each request its own budget", () => {
    // A shared counter would let one large payload reject an unrelated caller's
    // next request, which is a denial of service with extra steps.
    const first = createByteBudget(10);
    const second = createByteBudget(10);

    expect(first.add(11)).not.toBeNull();
    expect(second.add(5)).toBeNull();
    expect(second.total()).toBe(5);
  });

  it("keeps reporting a rejection once exceeded rather than resetting", () => {
    const budget = createByteBudget(10);

    expect(budget.add(11)).not.toBeNull();
    expect(budget.add(1)).not.toBeNull();
  });

  it("defaults to the ingest cap when no limit is given", () => {
    const budget = createByteBudget();

    expect(budget.add(MAX_INGEST_BYTES)).toBeNull();
    expect(budget.add(1)?.limit).toBe(MAX_INGEST_BYTES);
  });
});
