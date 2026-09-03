import { describe, expect, it } from "vitest";
import { z } from "zod";

import { knownFieldPaths } from "./unknownFieldPaths.ts";
import { createUnknownFieldLedger, noteAcceptedPayload } from "./unknownFields.ts";

describe("createUnknownFieldLedger", () => {
  it("starts with a zeroed tally for every vendor so a health endpoint can report nothing rather than an absence", () => {
    const ledger = createUnknownFieldLedger();

    expect(ledger.snapshot()).toEqual({
      scope: "accepted",
      byAdapter: {
        A: { total: 0, fields: {} },
        B: { total: 0, fields: {} },
        C: { total: 0, fields: {} },
      },
    });
  });

  it("names its scope in the snapshot rather than leaving the label to a consumer", () => {
    // ADR 15: the counter is scoped to accepted payloads, and says so in the
    // data. A second ledger for rejected payloads would carry a different
    // scope, so the health endpoint and the console can render the label from
    // the value instead of hardcoding a caveat that could go stale.
    expect(createUnknownFieldLedger().snapshot().scope).toBe("accepted");
  });

  it("counts occurrences per field path", () => {
    const ledger = createUnknownFieldLedger();

    ledger.noteAccepted("C", ["telemetry.undocumentedField"]);
    ledger.noteAccepted("C", ["telemetry.undocumentedField"]);
    ledger.noteAccepted("C", ["telemetry.somethingElse"]);

    expect(ledger.snapshot().byAdapter.C).toEqual({
      total: 3,
      fields: { "telemetry.undocumentedField": 2, "telemetry.somethingElse": 1 },
    });
  });

  it("accounts per adapter, not per robot: the same field from two robots is one dialect fact counted twice", () => {
    const ledger = createUnknownFieldLedger();

    ledger.noteAccepted("C", ["telemetry.undocumentedField"]);
    ledger.noteAccepted("C", ["telemetry.undocumentedField"]);

    const { byAdapter } = ledger.snapshot();
    expect(byAdapter.C.total).toBe(2);
    expect(Object.keys(byAdapter.C.fields)).toEqual(["telemetry.undocumentedField"]);
    expect(byAdapter.A.total).toBe(0);
    expect(byAdapter.B.total).toBe(0);
  });

  it("returns a snapshot that does not change as the ledger continues to record", () => {
    const ledger = createUnknownFieldLedger();
    ledger.noteAccepted("A", ["extra"]);

    const before = ledger.snapshot();
    ledger.noteAccepted("A", ["extra"]);

    expect(before.byAdapter.A.total).toBe(1);
    expect(ledger.snapshot().byAdapter.A.total).toBe(2);
  });
});

describe("noteAcceptedPayload", () => {
  const DIALECT = z.looseObject({
    robot_id: z.string(),
    telemetry: z.looseObject({ level: z.number() }),
  });
  const knownPaths = knownFieldPaths(DIALECT);

  function options(accepted: boolean, payload: unknown) {
    return {
      ledger: createUnknownFieldLedger(),
      vendor: "C" as const,
      accepted,
      payload,
      knownPaths,
    };
  }

  it("counts unknown fields on a payload the schema accepted", () => {
    const opts = options(true, {
      robot_id: "R-003",
      telemetry: { level: 1 },
      firmware_channel: "stable",
    });

    expect(noteAcceptedPayload(opts)).toEqual(["firmware_channel"]);
    expect(opts.ledger.snapshot().byAdapter.C.fields).toEqual({ firmware_channel: 1 });
  });

  it("counts nothing on a payload the schema rejected, even when it carries unknown fields", () => {
    // ADR 15's accepted trade, made structural: the precondition is an
    // argument, not something each of three vendor adapters has to remember.
    // The cost — a payload that is malformed *and* new shows no unknown-field
    // growth — is real, and the malformed-ingest counter is what covers it.
    const opts = options(false, { robot_id: 42, firmware_channel: "stable" });

    expect(noteAcceptedPayload(opts)).toEqual([]);
    expect(opts.ledger.snapshot().byAdapter.C.total).toBe(0);
  });

  it("leaves the ledger untouched when an accepted payload has nothing unknown", () => {
    const opts = options(true, { robot_id: "R-003", telemetry: { level: 1 } });

    expect(noteAcceptedPayload(opts)).toEqual([]);
    expect(opts.ledger.snapshot().byAdapter.C.total).toBe(0);
  });

  it("notes against the adapter it was told, not one inferred from the payload", () => {
    const opts = options(true, { robot_id: "R-003", telemetry: { level: 1 }, extra: 1 });

    noteAcceptedPayload(opts);

    const { byAdapter } = opts.ledger.snapshot();
    expect(byAdapter.C.total).toBe(1);
    expect(byAdapter.A.total).toBe(0);
    expect(byAdapter.B.total).toBe(0);
  });
});
